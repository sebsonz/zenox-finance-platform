import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import Decimal from "decimal.js";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { withTenantTransaction } from "../../../db/transaction.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../tenants/repositories/tenant.repository.js";

export const commercialDocumentRouter = Router();
const idSchema = z.string().uuid();
const decimalSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/);
const lineSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  unit: z.string().trim().max(32).optional(),
  quantity: decimalSchema,
  unitPrice: decimalSchema,
  discountPercent: z.string().regex(/^(?:100(?:\.0{1,6})?|(?:0|[1-9]\d?)(?:\.\d{1,6})?)$/).default("0"),
  taxRatePercent: z.string().regex(/^(?:100(?:\.0{1,6})?|(?:0|[1-9]\d?)(?:\.\d{1,6})?)$/).default("0"),
}).strict().refine((line) => new Decimal(line.quantity).gt(0) && new Decimal(line.discountPercent).lte(100) && new Decimal(line.taxRatePercent).lte(100), "Invalid line quantity or percentage.");
const documentSchema = z.object({
  customerId: idSchema,
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  validUntil: z.iso.date().optional(),
  notes: z.string().trim().max(5000).optional(),
  terms: z.string().trim().max(5000).optional(),
  lines: z.array(lineSchema).min(1).max(300),
}).strict();
const updateSchema = documentSchema.extend({ expectedUpdatedAt: z.iso.datetime({ offset: true }) });
const transitionSchema = z.object({ action: z.enum(["SEND","ACCEPT","REJECT","CANCEL","PUBLISH","EXPIRE"]), expectedUpdatedAt: z.iso.datetime({ offset: true }) }).strict();

type Kind = "quotes" | "proformas";
type ActorContext = { tenantId: string; actorType: "USER"; actorRef: string; correlationId: string };

async function contextFor(req: Request, res: Response, tenantId: string, permission: "invoices:read" | "invoices:create" | "invoices:issue"): Promise<ActorContext | null> {
  const user = req.financeUser;
  if (!user) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." } }); return null; }
  const membership = await userTenantMembershipRepository.findActiveMembership(tenantId, user.issuer, user.id);
  if (!membership) { res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "Active tenant membership is required." } }); return null; }
  try { assertActiveMembershipCan(membership, permission); }
  catch { res.status(403).json({ error: { code: "COMMERCIAL_DOCUMENT_ACCESS_DENIED", message: "The user is not authorized for this document operation." } }); return null; }
  if (!(await tenantRepository.findActiveById(tenantId))) { res.status(404).json({ error: { code: "TENANT_NOT_AVAILABLE", message: "The tenant is not available." } }); return null; }
  return { tenantId, actorType: "USER", actorRef: `${user.issuer}|${user.id}`, correlationId: String(res.locals["correlationId"] ?? "") };
}

function calculate(lines: z.infer<typeof lineSchema>[]) {
  const computed = lines.map((line, index) => {
    const subtotal = new Decimal(line.quantity).mul(line.unitPrice);
    const discount = subtotal.mul(line.discountPercent).div(100);
    const taxable = subtotal.minus(discount);
    const tax = taxable.mul(line.taxRatePercent).div(100);
    return { lineNumber: index + 1, ...line, subtotal: subtotal.toFixed(8), discountAmount: discount.toFixed(8), taxableAmount: taxable.toFixed(8), taxAmount: tax.toFixed(8), total: taxable.plus(tax).toFixed(8) };
  });
  const sum = (key: "subtotal" | "discountAmount" | "taxAmount" | "total") => computed.reduce((value, line) => value.plus(line[key]), new Decimal(0)).toFixed(8);
  return { lines: computed, subtotal: sum("subtotal"), discountTotal: sum("discountAmount"), taxTotal: sum("taxAmount"), grandTotal: sum("total") };
}

function tableNames(kind: Kind) {
  return kind === "quotes"
    ? { docs: "finance_quotes", lines: "finance_quote_lines", id: "quote_id", number: "quote_number", prefix: "QUO" }
    : { docs: "finance_proformas", lines: "finance_proforma_lines", id: "proforma_id", number: "proforma_number", prefix: "PRO" };
}

function registerRoutes(kind: Kind) {
  const names = tableNames(kind);
  const route = kind === "quotes" ? "quotes" : "proformas";
  const label = kind === "quotes" ? "quote" : "pro forma";
  const listPermission = "invoices:read" as const;
  const writePermission = "invoices:create" as const;

  commercialDocumentRouter.get(
    `/:tenantId/${route}`, requireUserAuth(),
    async (req: Request, res: Response, next: NextFunction) => {
      const tenant = idSchema.safeParse(req.params["tenantId"]);
      if (!tenant.success) { res.status(400).json({ error: { code: "INVALID_TENANT_ID" } }); return; }
      try {
        const context = await contextFor(req, res, tenant.data, listPermission); if (!context) return;
        const status = typeof req.query["status"] === "string" ? req.query["status"] : null;
        const search = typeof req.query["search"] === "string" ? req.query["search"].trim().slice(0, 120) : null;
        const rows = await withTenantTransaction(tenant.data, async (client) => {
          const result = await client.query(
            `SELECT d.id, d.${names.number} AS document_number, d.status, d.revision, d.customer_id, c.legal_name AS customer_name,
                    d.currency_code, d.issue_date, d.valid_until, d.subtotal::text, d.discount_total::text,
                    d.tax_total::text, d.grand_total::text, d.created_at, d.updated_at
               FROM public.${names.docs} d
               JOIN public.finance_customers c ON c.tenant_id = d.tenant_id AND c.id = d.customer_id
              WHERE d.tenant_id = $1 AND ($2::text IS NULL OR d.status = $2)
                AND ($3::text IS NULL OR d.${names.number} ILIKE '%' || $3 || '%' OR c.legal_name ILIKE '%' || $3 || '%')
              ORDER BY d.created_at DESC LIMIT 100`, [tenant.data, status, search],
          );
          return result.rows;
        });
        res.status(200).json({ data: { [kind]: rows, correlationId: context.correlationId } });
      } catch (error) { next(error); }
    },
  );

  commercialDocumentRouter.post(
    `/:tenantId/${route}`, requireUserAuth(),
    async (req: Request, res: Response, next: NextFunction) => {
      const tenant = idSchema.safeParse(req.params["tenantId"]);
      const body = documentSchema.safeParse(req.body);
      if (!tenant.success || !body.success) { res.status(400).json({ error: { code: "INVALID_COMMERCIAL_DOCUMENT", message: "The document data is invalid." } }); return; }
      try {
        const context = await contextFor(req, res, tenant.data, writePermission); if (!context) return;
        const totals = calculate(body.data.lines);
        const document = await withTenantTransaction(tenant.data, async (client) => {
          const customer = await client.query(
            `SELECT id, customer_type, legal_name, display_name, email, phone, country_code, tax_identifier,
                    registration_identifier, address_line1, address_line2, address_region, address_city, address_postal_code
               FROM public.finance_customers WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE' FOR SHARE`,
            [tenant.data, body.data.customerId],
          );
          if (!customer.rows[0]) throw Object.assign(new Error("CUSTOMER_NOT_FOUND"), { code: "CUSTOMER_NOT_FOUND" });
          const currency = await client.query("SELECT code FROM public.finance_currencies WHERE code = $1 AND is_active = true", [body.data.currencyCode]);
          if (!currency.rows[0]) throw Object.assign(new Error("CURRENCY_NOT_AVAILABLE"), { code: "CURRENCY_NOT_AVAILABLE" });
          const issuer = await client.query(
            `SELECT t.legal_name AS "legalName", t.country_code AS "countryCode", p.trade_name AS "tradeName",
                    p.general_email AS email, p.general_phone AS phone
               FROM public.finance_tenants t LEFT JOIN public.finance_tenant_profiles p ON p.tenant_id = t.id
              WHERE t.id = $1`, [tenant.data],
          );
          const c = customer.rows[0];
          const customerSnapshot = { id: c.id, customerType: c.customer_type, legalName: c.legal_name, displayName: c.display_name,
            email: c.email, phone: c.phone, countryCode: c.country_code, taxIdentifier: c.tax_identifier,
            registrationIdentifier: c.registration_identifier, address: c.address_line1, addressLine2: c.address_line2,
            region: c.address_region, city: c.address_city, postalCode: c.address_postal_code };
          const inserted = await client.query(
            `INSERT INTO public.${names.docs} (tenant_id, customer_id, currency_code, valid_until, customer_snapshot, issuer_snapshot,
              subtotal, discount_total, tax_total, grand_total, notes, terms, created_by_actor_type, created_by_actor_ref,
              updated_by_actor_type, updated_by_actor_ref)
             VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,'USER',$13,'USER',$13)
             RETURNING id, status, revision, currency_code, issue_date, valid_until, subtotal::text, discount_total::text, tax_total::text, grand_total::text, created_at, updated_at`,
            [tenant.data, body.data.customerId, body.data.currencyCode, body.data.validUntil ?? null, JSON.stringify(customerSnapshot),
              JSON.stringify(issuer.rows[0] ?? {}), totals.subtotal, totals.discountTotal, totals.taxTotal, totals.grandTotal,
              body.data.notes ?? null, body.data.terms ?? null, context.actorRef],
          );
          const created = inserted.rows[0];
          for (const line of totals.lines) {
            await client.query(
              `INSERT INTO public.${names.lines} (tenant_id, ${names.id}, line_number, description, unit, quantity, unit_price,
                discount_percent, tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
              [tenant.data, created.id, line.lineNumber, line.description, line.unit ?? null, line.quantity, line.unitPrice,
                line.discountPercent, line.taxRatePercent, line.subtotal, line.discountAmount, line.taxableAmount, line.taxAmount, line.total],
            );
          }
          return { ...created, customerId: body.data.customerId, customerSnapshot, issuerSnapshot: issuer.rows[0] ?? {}, lines: totals.lines };
        });
        res.status(201).json({ data: { [label]: document, calculationNature: "PROVISIONAL_COMMERCIAL_ESTIMATE", correlationId: context.correlationId } });
      } catch (error) {
        if (error instanceof Error && (error.message === "CUSTOMER_NOT_FOUND" || error.message === "CURRENCY_NOT_AVAILABLE")) {
          res.status(error.message === "CUSTOMER_NOT_FOUND" ? 404 : 422).json({ error: { code: error.message, message: error.message } }); return;
        }
        next(error);
      }
    },
  );

  commercialDocumentRouter.get(
    `/:tenantId/${route}/:documentId`, requireUserAuth(),
    async (req: Request, res: Response, next: NextFunction) => {
      const tenant = idSchema.safeParse(req.params["tenantId"]); const id = idSchema.safeParse(req.params["documentId"]);
      if (!tenant.success || !id.success) { res.status(400).json({ error: { code: "INVALID_RESOURCE_ID" } }); return; }
      try {
        const context = await contextFor(req, res, tenant.data, listPermission); if (!context) return;
        const document = await withTenantTransaction(tenant.data, async (client) => {
          const doc = await client.query(
            `SELECT d.*, d.subtotal::text, d.discount_total::text, d.tax_total::text, d.grand_total::text
               FROM public.${names.docs} d WHERE d.tenant_id = $1 AND d.id = $2`, [tenant.data, id.data],
          );
          if (!doc.rows[0]) return null;
          const lines = await client.query(
            `SELECT line_number AS "lineNumber", description, unit, quantity::text, unit_price::text AS "unitPrice",
                    discount_percent::text AS "discountPercent", tax_rate_percent::text AS "taxRatePercent",
                    subtotal::text, discount_amount::text AS "discountAmount", taxable_amount::text AS "taxableAmount",
                    tax_amount::text AS "taxAmount", total::text
               FROM public.${names.lines} WHERE tenant_id = $1 AND ${names.id} = $2 ORDER BY line_number`,
            [tenant.data, id.data],
          );
          return { ...doc.rows[0], lines: lines.rows };
        });
        if (!document) { res.status(404).json({ error: { code: "DOCUMENT_NOT_FOUND" } }); return; }
        res.status(200).json({ data: { [label]: document, correlationId: context.correlationId } });
      } catch (error) { next(error); }
    },
  );

  commercialDocumentRouter.put(
    `/:tenantId/${route}/:documentId`, requireUserAuth(),
    async (req: Request, res: Response, next: NextFunction) => {
      const tenant = idSchema.safeParse(req.params["tenantId"]); const id = idSchema.safeParse(req.params["documentId"]);
      const body = updateSchema.safeParse(req.body);
      if (!tenant.success || !id.success || !body.success) { res.status(400).json({ error: { code: "INVALID_COMMERCIAL_DOCUMENT", message: "Valid IDs and document data are required." } }); return; }
      try {
        const context = await contextFor(req, res, tenant.data, writePermission); if (!context) return;
        const totals = calculate(body.data.lines);
        const updated = await withTenantTransaction(tenant.data, async (client) => {
          const locked = await client.query(`SELECT status, updated_at FROM public.${names.docs} WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenant.data,id.data]);
          if (!locked.rows[0] || locked.rows[0].status !== "DRAFT" || new Date(locked.rows[0].updated_at).toISOString() !== body.data.expectedUpdatedAt) return null;
          const customer = await client.query("SELECT id, legal_name, display_name, email, phone, country_code, tax_identifier, registration_identifier, address_line1, address_line2, address_region, address_city, address_postal_code FROM public.finance_customers WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'", [tenant.data,body.data.customerId]);
          if (!customer.rows[0]) throw Object.assign(new Error("CUSTOMER_NOT_FOUND"), { code: "CUSTOMER_NOT_FOUND" });
          const c=customer.rows[0];
          const snapshot={id:c.id,legalName:c.legal_name,displayName:c.display_name,email:c.email,phone:c.phone,countryCode:c.country_code,taxIdentifier:c.tax_identifier,registrationIdentifier:c.registration_identifier,address:c.address_line1,addressLine2:c.address_line2,region:c.address_region,city:c.address_city,postalCode:c.address_postal_code};
          const result=await client.query(`UPDATE public.${names.docs} SET customer_id=$3,currency_code=$4,valid_until=$5,customer_snapshot=$6::jsonb,subtotal=$7,discount_total=$8,tax_total=$9,grand_total=$10,notes=$11,terms=$12,updated_by_actor_type='USER',updated_by_actor_ref=$13,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,updated_at,subtotal::text,discount_total::text,tax_total::text,grand_total::text`,
            [tenant.data,id.data,body.data.customerId,body.data.currencyCode,body.data.validUntil??null,JSON.stringify(snapshot),totals.subtotal,totals.discountTotal,totals.taxTotal,totals.grandTotal,body.data.notes??null,body.data.terms??null,context.actorRef]);
          await client.query(`DELETE FROM public.${names.lines} WHERE tenant_id=$1 AND ${names.id}=$2`,[tenant.data,id.data]);
          for(const line of totals.lines) await client.query(`INSERT INTO public.${names.lines}(tenant_id,${names.id},line_number,description,unit,quantity,unit_price,discount_percent,tax_rate_percent,subtotal,discount_amount,taxable_amount,tax_amount,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [tenant.data,id.data,line.lineNumber,line.description,line.unit??null,line.quantity,line.unitPrice,line.discountPercent,line.taxRatePercent,line.subtotal,line.discountAmount,line.taxableAmount,line.taxAmount,line.total]);
          return {...result.rows[0],lines:totals.lines};
        });
        if (!updated) { res.status(409).json({ error: { code: "DOCUMENT_NOT_DRAFT_OR_CHANGED", message: "Only an unchanged draft can be modified." } }); return; }
        res.status(200).json({data:{[label]:updated,correlationId:context.correlationId}});
      } catch(error){if(error instanceof Error&&error.message==="CUSTOMER_NOT_FOUND"){res.status(404).json({error:{code:"CUSTOMER_NOT_FOUND"}});return;}next(error);}
    },
  );

  commercialDocumentRouter.post(
    `/:tenantId/${route}/:documentId/transition`, requireUserAuth(),
    async (req: Request, res: Response, next: NextFunction) => {
      const tenant=idSchema.safeParse(req.params["tenantId"]); const id=idSchema.safeParse(req.params["documentId"]); const body=transitionSchema.safeParse(req.body);
      if(!tenant.success||!id.success||!body.success){res.status(400).json({error:{code:"INVALID_DOCUMENT_TRANSITION"}});return;}
      const allowed = kind==="quotes"
        ? {SEND:["DRAFT"],ACCEPT:["SENT"],REJECT:["SENT"],CANCEL:["DRAFT","SENT"],PUBLISH:[],EXPIRE:["SENT"]}
        : {SEND:[],ACCEPT:[],REJECT:[],CANCEL:["DRAFT","PUBLISHED"],PUBLISH:["DRAFT"],EXPIRE:["PUBLISHED"]};
      try{
        const context=await contextFor(req,res,tenant.data,body.data.action==="ACCEPT"||body.data.action==="REJECT"?"invoices:issue":"invoices:create");if(!context)return;
        const result=await withTenantTransaction(tenant.data,async(client)=>{
          const locked=await client.query(`SELECT status,updated_at,${names.number} AS document_number FROM public.${names.docs} WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[tenant.data,id.data]);
          const row=locked.rows[0]; if(!row||new Date(row.updated_at).toISOString()!==body.data.expectedUpdatedAt)return null;
          const currentStatus=String(row.status); if(!(allowed[body.data.action] as string[]).includes(currentStatus))return {conflict:true};
          let nextStatus: string;
          switch(body.data.action){case "SEND":nextStatus="SENT";break;case "ACCEPT":nextStatus="ACCEPTED";break;case "REJECT":nextStatus="REJECTED";break;case "PUBLISH":nextStatus="PUBLISHED";break;case "EXPIRE":nextStatus="EXPIRED";break;default:nextStatus="CANCELLED";}
          let number=row.document_number as string|null;
          if((body.data.action==="SEND"||body.data.action==="PUBLISH")&&!number){
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",[tenant.data,`${names.prefix}-${new Date().getUTCFullYear()}`]);
            const count=await client.query(`SELECT COUNT(*)::int AS n FROM public.${names.docs} WHERE tenant_id=$1 AND ${names.number} IS NOT NULL AND ${names.number} LIKE $2`,[tenant.data,`${names.prefix}-${new Date().getUTCFullYear()}-%`]);
            number=`${names.prefix}-${new Date().getUTCFullYear()}-${String(Number(count.rows[0].n)+1).padStart(6,"0")}`;
          }
          const result=await client.query(`UPDATE public.${names.docs} SET status=$3,${names.number}=$4,
            sent_at=CASE WHEN $3='SENT' THEN now() ELSE sent_at END,
            published_at=CASE WHEN $3='PUBLISHED' THEN now() ELSE published_at END,
            accepted_at=CASE WHEN $3='ACCEPTED' THEN now() ELSE accepted_at END,
            rejected_at=CASE WHEN $3='REJECTED' THEN now() ELSE rejected_at END,
            updated_by_actor_type='USER',updated_by_actor_ref=$5,updated_at=now()
            WHERE tenant_id=$1 AND id=$2 RETURNING id,status,${names.number} AS document_number,updated_at,grand_total::text`,
            [tenant.data,id.data,nextStatus,number,context.actorRef]);
          return result.rows[0];
        });
        if(!result){res.status(409).json({error:{code:"DOCUMENT_CHANGED"}});return;}
        if("conflict" in result){res.status(409).json({error:{code:"INVALID_DOCUMENT_STATE"}});return;}
        res.status(200).json({data:{document:result,correlationId:context.correlationId}});
      }catch(error){next(error);}
    },
  );
}

registerRoutes("quotes");
registerRoutes("proformas");
