import { Router, type Request, type Response } from "express";
import express from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { withTenantTransaction } from "../../../db/transaction.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../tenants/repositories/tenant.repository.js";
import { taxRuleSchema } from "../../tax/validators/tax-rule.schema.js";
import { createTenantJurisdictionAssignmentSchema } from "../../tax/schemas/tenant-jurisdiction.schema.js";
import { tenantTaxAssignmentRepository } from "../../tax/repositories/tenant-tax-assignment.repository.js";
import { taxAssignmentEvidenceService, TaxAssignmentEvidenceError } from "../../tax/application/tax-assignment-evidence.service.js";

export const userTenantTaxRouter = Router();
const uuidSchema = z.string().uuid();

userTenantTaxRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function sameOrigin(req: Request): boolean {
  const origin = req.header("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host.toLowerCase() === (req.get("host") ?? "").toLowerCase();
  } catch {
    return false;
  }
}

function parseTenantId(req: Request, res: Response): string | null {
  const parsed = uuidSchema.safeParse(req.params["tenantId"]);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." } });
    return null;
  }
  return parsed.data;
}

async function authorize(
  tenantId: string,
  req: Request,
  res: Response,
  permission: "tax:read" | "tax:manage",
): Promise<{ correlationId: string } | null> {
  const user = req.financeUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user session is required." } });
    return null;
  }
  const membership = await userTenantMembershipRepository.findActiveMembership(tenantId, user.issuer, user.id);
  if (!membership) {
    res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "Active tenant membership is required." } });
    return null;
  }
  try {
    assertActiveMembershipCan(membership, permission);
  } catch {
    res.status(403).json({ error: { code: "TAX_ACCESS_DENIED", message: "You are not authorized for this tax operation." } });
    return null;
  }
  if (!(await tenantRepository.findActiveById(tenantId))) {
    res.status(404).json({ error: { code: "TENANT_NOT_AVAILABLE", message: "The tenant is not available." } });
    return null;
  }
  return { correlationId: String(res.locals["correlationId"] ?? "") };
}

userTenantTaxRouter.get("/:tenantId/tax-jurisdictions", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  try {
    const context = await authorize(tenantId, req, res, "tax:read");
    if (!context) return;
    const jurisdictions = await withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<{
        id: string; code: string; country_code: string; name: string;
        jurisdiction_level: string; parent_id: string | null;
      }>(
        `SELECT id, code, country_code, name, jurisdiction_level, parent_id
           FROM public.finance_tax_jurisdictions j
          WHERE j.is_active = true
            AND EXISTS (
              SELECT 1
                FROM public.finance_tenant_tax_jurisdictions tj
               WHERE tj.tenant_id = $1
                 AND tj.jurisdiction_id = j.id
                 AND tj.status = 'ACTIVE'
                 AND tj.valid_from <= CURRENT_DATE
                 AND (tj.valid_to IS NULL OR tj.valid_to >= CURRENT_DATE)
            )
          ORDER BY j.country_code, j.jurisdiction_level, j.name`,
        [tenantId],
      );
      return result.rows.map((row) => ({
        id: row.id, code: row.code, countryCode: row.country_code.trim(),
        name: row.name, level: row.jurisdiction_level, parentId: row.parent_id,
      }));
    });
    res.status(200).json({ data: { jurisdictions, correlationId: context.correlationId } });
  } catch (error) { next(error); }
});

userTenantTaxRouter.get("/:tenantId/tax-rules", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  const jurisdictionId = req.query["jurisdictionId"] === undefined
    ? undefined : uuidSchema.safeParse(req.query["jurisdictionId"]);
  if (jurisdictionId && !jurisdictionId.success) {
    res.status(400).json({ error: { code: "INVALID_JURISDICTION_ID", message: "A valid jurisdiction ID is required." } });
    return;
  }
  try {
    const context = await authorize(tenantId, req, res, "tax:read");
    if (!context) return;
    const rules = await withTenantTransaction(tenantId, async (client) => {
      const result = await client.query(
        `SELECT r.id, r.tenant_id, r.jurisdiction_id, j.code AS jurisdiction_code,
                r.rule_code, r.name, r.tax_type, r.treatment, r.rate_percent::text AS rate_percent,
                r.price_mode, r.priority, r.is_compound, r.applies_to, r.source_reference,
                r.source_url, r.version, r.valid_from::text AS valid_from,
                r.valid_to::text AS valid_to, r.status, r.created_at::text AS created_at,
                r.accounting_treatment, r.applicability_conditions
           FROM public.finance_tax_rules r
           JOIN public.finance_tax_jurisdictions j ON j.id = r.jurisdiction_id
          WHERE (r.tenant_id IS NULL OR r.tenant_id = $1)
            AND ($2::uuid IS NULL OR r.jurisdiction_id = $2)
            AND EXISTS (
              SELECT 1
                FROM public.finance_tenant_tax_jurisdictions tj
               WHERE tj.tenant_id = $1
                 AND tj.jurisdiction_id = r.jurisdiction_id
                 AND tj.status = 'ACTIVE'
                 AND tj.valid_from <= CURRENT_DATE
                 AND (tj.valid_to IS NULL OR tj.valid_to >= CURRENT_DATE)
            )
          ORDER BY j.country_code, r.rule_code, r.version DESC`,
        [tenantId, jurisdictionId?.success ? jurisdictionId.data : null],
      );
      return result.rows.map((row) => ({
        id: row.id, tenantId: row.tenant_id, jurisdictionId: row.jurisdiction_id,
        jurisdictionCode: row.jurisdiction_code, ruleCode: row.rule_code, name: row.name,
        taxType: row.tax_type, treatment: row.treatment, ratePercent: row.rate_percent,
        priceMode: row.price_mode, priority: row.priority, isCompound: row.is_compound,
        appliesTo: row.applies_to, sourceReference: row.source_reference, sourceUrl: row.source_url,
        version: row.version, validFrom: row.valid_from, validTo: row.valid_to,
        status: row.status, scope: row.tenant_id === null ? "GLOBAL" : "ORGANIZATION",
        createdAt: row.created_at,
        accountingTreatment: row.accounting_treatment,
        applicabilityConditions: row.applicability_conditions,
      }));
    });
    res.status(200).json({ data: { rules, correlationId: context.correlationId } });
  } catch (error) { next(error); }
});

userTenantTaxRouter.post("/:tenantId/tax-rules", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed." } });
    return;
  }
  const parsed = taxRuleSchema.safeParse({
    ...(typeof req.body === "object" && req.body !== null ? req.body : {}),
    tenantId,
    version: 1,
    status: "DRAFT",
  });
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "INVALID_TAX_RULE", message: "The tax rule is invalid.", issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."), message: issue.message,
      })) },
    });
    return;
  }
  try {
    const context = await authorize(tenantId, req, res, "tax:manage");
    if (!context) return;
    const rule = await withTenantTransaction(tenantId, async (client) => {
      const jurisdiction = await client.query(
        `SELECT j.id
           FROM public.finance_tax_jurisdictions j
          WHERE j.id = $1
            AND j.is_active = true
            AND EXISTS (
              SELECT 1
                FROM public.finance_tenant_tax_jurisdictions tj
               WHERE tj.tenant_id = $2
                 AND tj.jurisdiction_id = j.id
                 AND tj.status = 'ACTIVE'
                 AND tj.valid_from <= CURRENT_DATE
                 AND (tj.valid_to IS NULL OR tj.valid_to >= CURRENT_DATE)
            )`,
        [parsed.data.jurisdictionId, tenantId],
      );
      if (!jurisdiction.rows[0]) {
        const error = new Error("JURISDICTION_NOT_AVAILABLE");
        error.name = "TaxAdminValidationError";
        throw error;
      }
      const versionResult = await client.query<{ next_version: number }>(
        `SELECT COALESCE(MAX(version), 0)::int + 1 AS next_version
           FROM public.finance_tax_rules
          WHERE tenant_id = $1 AND jurisdiction_id = $2 AND rule_code = $3`,
        [tenantId, parsed.data.jurisdictionId, parsed.data.ruleCode],
      );
      const version = versionResult.rows[0]?.next_version ?? 1;
      const inserted = await client.query(
        `INSERT INTO public.finance_tax_rules
          (tenant_id, jurisdiction_id, rule_code, name, tax_type, treatment, rate_percent,
           price_mode, priority, is_compound, applies_to, source_reference, source_url,
           version, valid_from, valid_to, status, accounting_treatment, applicability_conditions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'DRAFT',$17,$18::jsonb)
         RETURNING id, jurisdiction_id, rule_code, name, tax_type, treatment,
                   rate_percent::text AS rate_percent, price_mode, priority, is_compound,
                   applies_to, source_reference, source_url, version,
                   valid_from::text AS valid_from, valid_to::text AS valid_to, status`,
        [tenantId, parsed.data.jurisdictionId, parsed.data.ruleCode, parsed.data.name,
          parsed.data.taxType, parsed.data.treatment, parsed.data.ratePercent, parsed.data.priceMode,
          parsed.data.priority, parsed.data.isCompound, parsed.data.appliesTo,
          parsed.data.sourceReference ?? null, parsed.data.sourceUrl ?? null, version,
          parsed.data.validFrom, parsed.data.validTo ?? null,
          parsed.data.accountingTreatment, JSON.stringify(parsed.data.applicabilityConditions)],
      );
      return inserted.rows[0];
    });
    res.status(201).json({ data: { rule, status: "DRAFT", correlationId: context.correlationId } });
  } catch (error) {
    if (error instanceof Error && error.name === "TaxAdminValidationError") {
      res.status(422).json({ error: { code: "JURISDICTION_NOT_AVAILABLE", message: "The selected jurisdiction is not active." } });
      return;
    }
    next(error);
  }
});


// Organization tax jurisdiction assignment requests.
userTenantTaxRouter.get("/:tenantId/tax-assignments", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  try {
    const context = await authorize(tenantId, req, res, "tax:read");
    if (!context || !req.financeUser) return;
    const assignments = await tenantTaxAssignmentRepository.list(
      tenantId,req.financeUser.issuer,req.financeUser.id,
    );
    res.status(200).json({ data: { assignments, correlationId: context.correlationId } });
  } catch (error) { next(error); }
});

userTenantTaxRouter.post("/:tenantId/tax-assignments", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed." } });
    return;
  }
  const parsed = createTenantJurisdictionAssignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_TAX_ASSIGNMENT", message: "The tax jurisdiction assignment request is invalid." } });
    return;
  }
  try {
    const context = await authorize(tenantId,req,res,"tax:manage");
    if (!context || !req.financeUser) return;
    const assignmentId = await tenantTaxAssignmentRepository.create({
      tenantId,jurisdictionId:parsed.data.jurisdictionId,validFrom:parsed.data.validFrom,
      validTo:parsed.data.validTo ?? null,basisType:parsed.data.basisType,
      basisReference:parsed.data.basisReference ?? null,
      issuer:req.financeUser.issuer,subject:req.financeUser.id,
      initiatedBy:"TENANT",correlationId:context.correlationId,
    });
    res.status(201).json({ data: { assignmentId,status:"PENDING_REVIEW",correlationId:context.correlationId } });
  } catch (error) {
    const db = error as { code?: string; message?: string };
    if (db.code === "42501") {
      res.status(403).json({ error: { code: db.message ?? "TAX_ASSIGNMENT_MANAGE_REQUIRED", message: "You are not authorized to request this tax assignment." } });
      return;
    }
    if (db.code === "P0002") {
      res.status(404).json({ error: { code: db.message ?? "TAX_REFERENCE_NOT_FOUND", message: "The tenant or jurisdiction is not available." } });
      return;
    }
    if (db.code === "22023") {
      res.status(422).json({ error: { code: db.message ?? "INVALID_TAX_ASSIGNMENT", message: "The tax assignment request does not satisfy business rules." } });
      return;
    }
    next(error);
  }
});


userTenantTaxRouter.get("/:tenantId/tax-assignments/:assignmentId/evidence", requireUserAuth(), async(req,res,next)=>{
  const tenantId=parseTenantId(req,res);if(!tenantId)return;
  const assignmentId=uuidSchema.safeParse(req.params["assignmentId"]);
  if(!assignmentId.success){res.status(400).json({error:{code:"INVALID_ASSIGNMENT_ID",message:"A valid assignment ID is required."}});return;}
  try{
    const context=await authorize(tenantId,req,res,"tax:read");
    if(!context||!req.financeUser)return;
    const result=await withTenantTransaction(tenantId,async(client)=>client.query(
      "SELECT * FROM public.finance_list_tax_assignment_evidence($1,$2,$3)",
      [assignmentId.data,req.financeUser!.issuer,req.financeUser!.id],
    ));
    res.setHeader("Cache-Control","no-store");
    res.status(200).json({data:{evidence:result.rows,correlationId:context.correlationId}});
  }catch(error){next(error);}
});

userTenantTaxRouter.post("/:tenantId/tax-assignments/:assignmentId/evidence", requireUserAuth(), (req,res,next)=>{
  if(!sameOrigin(req)){res.status(403).json({error:{code:"ORIGIN_NOT_ALLOWED",message:"The request origin is not allowed."}});return;}
  express.raw({type:["application/pdf","image/jpeg","image/png"],limit:"10mb"})(req,res,next);
}, async(req,res,next)=>{
  const tenantId=parseTenantId(req,res);if(!tenantId)return;
  const assignmentId=uuidSchema.safeParse(req.params["assignmentId"]);
  if(!assignmentId.success||!req.financeUser){res.status(req.financeUser?400:401).json({error:{code:req.financeUser?"INVALID_ASSIGNMENT_ID":"UNAUTHENTICATED",message:"The assignment or session is invalid."}});return;}
  const type=z.enum(["TAX_REGISTRATION","BUSINESS_REGISTRATION","PROOF_OF_ADDRESS","AUTHORIZATION_LETTER","OTHER"]).safeParse(req.header("x-document-type"));
  const filename=req.header("x-file-name");
  if(!type.success||!filename||filename.length>180||!Buffer.isBuffer(req.body)){
    res.status(400).json({error:{code:"INVALID_DOCUMENT_METADATA",message:"Document type, filename and file content are required."}});return;
  }
  try{
    const context=await authorize(tenantId,req,res,"tax:manage");
    if(!context)return;
    const document=await taxAssignmentEvidenceService.upload({
      assignmentId:assignmentId.data,tenantId,issuer:req.financeUser.issuer,
      subject:req.financeUser.id,correlationId:context.correlationId,type:type.data,
      filename,contentType:req.header("content-type")??"",bytes:req.body,
    });
    res.status(201).json({data:{document,correlationId:context.correlationId}});
  }catch(error){
    if(error instanceof TaxAssignmentEvidenceError){
      const status=error.code==="TAX_ASSIGNMENT_NOT_EDITABLE"?409:
        error.code==="DOCUMENT_STORAGE_UNAVAILABLE"||error.code==="DOCUMENT_STORAGE_FAILED"?503:422;
      res.status(status).json({error:{code:error.code,message:error.message}});return;
    }
    const db=error as {code?:string;message?:string};
    if(db.code==="42501"){res.status(403).json({error:{code:db.message??"TAX_ASSIGNMENT_MANAGE_REQUIRED",message:"You are not authorized to upload evidence."}});return;}
    if(db.code==="P0002"){res.status(404).json({error:{code:db.message??"TAX_ASSIGNMENT_NOT_FOUND",message:"The tax assignment is not available."}});return;}
    next(error);
  }
});

userTenantTaxRouter.get("/:tenantId/tax-assignment-evidence/:evidenceId/content", requireUserAuth(), async(req,res,next)=>{
  const tenantId=parseTenantId(req,res);if(!tenantId)return;
  const evidenceId=uuidSchema.safeParse(req.params["evidenceId"]);
  if(!evidenceId.success||!req.financeUser){res.status(req.financeUser?404:401).json({error:{code:req.financeUser?"TAX_EVIDENCE_NOT_FOUND":"UNAUTHENTICATED"}});return;}
  try{
    const context=await authorize(tenantId,req,res,"tax:read");
    if(!context)return;
    const file=await taxAssignmentEvidenceService.download(evidenceId.data,req.financeUser.issuer,req.financeUser.id);
    res.setHeader("Cache-Control","private,no-store");
    res.setHeader("Content-Type",file.contentType);
    res.setHeader("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader("X-Content-Type-Options","nosniff");
    const reader=file.body.getReader();
    while(true){const chunk=await reader.read();if(chunk.done)break;res.write(chunk.value);}
    res.end();
  }catch(error){
    if(error instanceof TaxAssignmentEvidenceError){res.status(error.code==="TAX_EVIDENCE_NOT_FOUND"?404:503).json({error:{code:error.code,message:error.message}});return;}
    const db=error as {code?:string;message?:string};
    if(db.code==="42501"){res.status(403).json({error:{code:db.message??"TAX_EVIDENCE_ACCESS_DENIED"}});return;}
    if(db.code==="P0002"){res.status(404).json({error:{code:db.message??"TAX_EVIDENCE_NOT_FOUND"}});return;}
    next(error);
  }
});
