import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { withTenantTransaction } from "../../../db/transaction.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../tenants/repositories/tenant.repository.js";
import { customerRepository } from "../../customers/repositories/customer.repository.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import { calculateInvoiceTotals } from "../../invoices/engine/invoice-calculation.engine.js";
import { invoiceDraftService } from "../../invoices/services/invoice-draft.service.js";
import type { FinanceUserInvoiceContext } from "../../invoices/types/invoice-operation-context.js";
import { recordInvoiceAudit } from "../../invoices/repositories/invoice-audit.repository.js";

export const userCommercialDocumentsRouter = Router();
const uuid = z.string().uuid();
const decimal = z.string().regex(/^(?:0|[1-9]\\d*)(?:\\.\\d+)?$/);
const lineSchema = z.object({
 description:z.string().trim().min(1).max(500), itemCode:z.string().trim().max(100).optional(),
 unit:z.string().trim().max(40).optional(), lineNote:z.string().trim().max(1000).optional(),
 quantity:decimal, unitPrice:decimal, discountPercent:decimal.default("0"), taxRatePercent:decimal.default("0"),
}).strict();
const documentSchema = z.object({
 customerId:uuid, currencyCode:z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
 validUntil:z.iso.date().optional(), notes:z.string().trim().max(5000).optional(),
 document:z.record(z.string(),z.unknown()).optional(), lines:z.array(lineSchema).min(1).max(500),
}).strict();
const actionSchema=z.object({reason:z.string().trim().min(3).max(1000).optional()}).strict();

async function contextFor(tenantId:string,req:Request,res:Response,permission:"invoices:read"|"invoices:create"|"invoices:issue"):Promise<FinanceUserInvoiceContext|null>{
 const user=req.financeUser;
 if(!user){res.status(401).json({error:{code:"UNAUTHENTICATED",message:"Authentication required."}});return null;}
 const membership=await userTenantMembershipRepository.findActiveMembership(tenantId,user.issuer,user.id);
 if(!membership){res.status(403).json({error:{code:"TENANT_ACCESS_DENIED",message:"Active tenant membership required."}});return null;}
 try{assertActiveMembershipCan(membership,permission);}catch{res.status(403).json({error:{code:"PERMISSION_DENIED",message:"Insufficient tenant permission."}});return null;}
 if(!await tenantRepository.findActiveById(tenantId)){res.status(404).json({error:{code:"TENANT_NOT_AVAILABLE",message:"Tenant unavailable."}});return null;}
 return {tenantId,correlationId:String(res.locals["correlationId"]??""),actor:{type:"USER",ref:user.issuer+"|"+user.id,membershipId:membership.id,identityIssuer:user.issuer,identitySubject:user.id}};
}
function fail(res:Response,code:string,message:string,status=422){res.status(status).json({error:{code,message}});}
async function loadCommercialDraft(tenantId:string,customerId:string,currencyCode:string,lines:z.infer<typeof lineSchema>[],kind:"QUOTE"|"PROFORMA"){
 const currency=await currencyRepository.findActiveByCode(currencyCode);
 if(!currency) throw new Error("CURRENCY_NOT_SUPPORTED");
 return withTenantTransaction(tenantId,async client=>{
  const customer=await customerRepository.findById(client,customerId);
  if(!customer||customer.status!=="ACTIVE") throw new Error("CUSTOMER_NOT_ACTIVE");
  const totals=calculateInvoiceTotals({currency:currency.code,currencyDecimalPlaces:currency.minorUnit,lines:lines.map(l=>({quantity:l.quantity,unitPrice:l.unitPrice,discountPercent:l.discountPercent,taxRatePercent:l.taxRatePercent}))});
  const tenant=await client.query("SELECT legal_name,tenant_code,country_code FROM public.finance_tenants WHERE id=$1",[tenantId]);
  const seller=tenant.rows[0]??{};
  return {currency,customer,totals,seller};
 });
}
function actor(context:FinanceUserInvoiceContext){return {type:"USER" as const,ref:context.actor.ref};}

userCommercialDocumentsRouter.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});

// Quotes: independent commercial document lifecycle; no fiscal invoice number or tax snapshot.
userCommercialDocumentsRouter.get("/:tenantId/quotes",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]);if(!id.success)return fail(res,"INVALID_TENANT_ID","Tenant ID is invalid.",400);
 const ctx=await contextFor(id.data,req,res,"invoices:read");if(!ctx)return;
 const rows=await withTenantTransaction(id.data,c=>c.query("SELECT id,quote_code,status,currency_code,issue_date,valid_until,grand_total,accepted_at,rejected_at,sent_at,created_at,updated_at FROM public.finance_quotes WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200",[id.data]));
 res.json({data:{quotes:rows.rows,correlationId:ctx.correlationId}});
 }catch(e){next(e);}
});
userCommercialDocumentsRouter.post("/:tenantId/quotes",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),body=documentSchema.safeParse(req.body);if(!id.success||!body.success)return fail(res,"INVALID_QUOTE","Quote payload or tenant ID is invalid.",400);
 const ctx=await contextFor(id.data,req,res,"invoices:create");if(!ctx)return;
 const {currency,customer,totals,seller}=await loadCommercialDraft(id.data,body.data.customerId,body.data.currencyCode,body.data.lines,"QUOTE");
 const result=await withTenantTransaction(id.data,async c=>{
 const inserted=await c.query("INSERT INTO public.finance_quotes(tenant_id,customer_id,currency_code,currency_minor_unit,valid_until,customer_snapshot,seller_snapshot,document_metadata,notes,subtotal,discount_total,taxable_total,estimated_tax_total,grand_total,created_by_actor_type,created_by_actor_ref,updated_by_actor_type,updated_by_actor_ref) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,'USER',$15,'USER',$15) RETURNING *",
 [id.data,customer.id,currency.code,currency.minorUnit,body.data.validUntil??null,JSON.stringify({id:customer.id,legalName:customer.legalName,displayName:customer.displayName,email:customer.email,phone:customer.phone,countryCode:customer.countryCode,taxIdentifier:customer.taxIdentifier,registrationIdentifier:customer.registrationIdentifier}),JSON.stringify({legalName:seller.legal_name,tenantCode:seller.tenant_code,countryCode:seller.country_code}),JSON.stringify(body.data.document??{}),body.data.notes??null,totals.subtotal,totals.discountTotal,totals.taxableTotal,totals.taxTotal,totals.grandTotal,ctx.actor.ref]);
 const quote=inserted.rows[0];
 for(let i=0;i<body.data.lines.length;i++){const l=body.data.lines[i]!,x=totals.lines[i]!;await c.query("INSERT INTO public.finance_quote_lines(tenant_id,quote_id,line_number,description,item_code,unit_label,line_note,quantity,unit_price,discount_percent,indicative_tax_rate,subtotal,discount_amount,taxable_amount,estimated_tax_amount,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",[id.data,quote.id,i+1,l.description,l.itemCode??null,l.unit??null,l.lineNote??null,x.quantity,x.unitPrice,x.discountPercent,x.taxRatePercent,x.subtotal,x.discountAmount,x.taxableAmount,x.taxAmount,x.total]);}
 await recordInvoiceAudit(c,ctx,"quote.draft.created","QUOTE",quote.id,{lineCount:body.data.lines.length});
 return quote;
 });
 res.status(201).json({data:{quote:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&["CURRENCY_NOT_SUPPORTED","CUSTOMER_NOT_ACTIVE"].includes(e.message))return fail(res,e.message,"Customer or currency is unavailable.",422);next(e);}
});
userCommercialDocumentsRouter.get("/:tenantId/quotes/:quoteId",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),qid=uuid.safeParse(req.params["quoteId"]);if(!id.success||!qid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);
 const ctx=await contextFor(id.data,req,res,"invoices:read");if(!ctx)return;
 const quote=await withTenantTransaction(id.data,async c=>{const q=await c.query("SELECT * FROM public.finance_quotes WHERE tenant_id=$1 AND id=$2",[id.data,qid.data]);if(!q.rows[0])return null;const lines=await c.query("SELECT * FROM public.finance_quote_lines WHERE tenant_id=$1 AND quote_id=$2 ORDER BY line_number",[id.data,qid.data]);return {...q.rows[0],lines:lines.rows};});
 if(!quote)return fail(res,"QUOTE_NOT_FOUND","Quote not found.",404);res.json({data:{quote,correlationId:ctx.correlationId}});
 }catch(e){next(e);}
});
userCommercialDocumentsRouter.post("/:tenantId/quotes/:quoteId/send",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),qid=uuid.safeParse(req.params["quoteId"]);if(!id.success||!qid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);
 const ctx=await contextFor(id.data,req,res,"invoices:issue");if(!ctx)return;
 const quote=await withTenantTransaction(id.data,async c=>{
 const q=await c.query("SELECT * FROM public.finance_quotes WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,qid.data]);if(!q.rows[0]||q.rows[0].status!=="DRAFT")throw new Error("QUOTE_NOT_DRAFT");
 const today=new Date().toISOString().slice(0,10),year=Number(today.slice(0,4));
 const seq=await c.query("INSERT INTO public.finance_quote_sequences(tenant_id,fiscal_year,next_number) VALUES($1,$2,2) ON CONFLICT(tenant_id,fiscal_year) DO UPDATE SET next_number=public.finance_quote_sequences.next_number+1 RETURNING next_number-1 AS allocated",[id.data,year]);
 const code="QUO-"+year+"-"+String(seq.rows[0].allocated).padStart(6,"0");
 const updated=await c.query("UPDATE public.finance_quotes SET status='SENT',quote_code=$3,issue_date=$4,sent_at=now(),updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$5 WHERE tenant_id=$1 AND id=$2 RETURNING *",[id.data,qid.data,code,today,ctx.actor.ref]);await recordInvoiceAudit(c,ctx,"quote.sent","QUOTE",qid.data,{quoteCode:code});return updated.rows[0];
 });res.json({data:{quote,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&e.message==="QUOTE_NOT_DRAFT")return fail(res,e.message,"Only a draft quote can be sent.",409);next(e);}
});
for(const decision of ["accept","reject","expire"] as const){
 userCommercialDocumentsRouter.post("/:tenantId/quotes/:quoteId/"+decision,requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),qid=uuid.safeParse(req.params["quoteId"]);if(!id.success||!qid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);
 const ctx=await contextFor(id.data,req,res,"invoices:issue");if(!ctx)return;
 const result=await withTenantTransaction(id.data,async c=>{
 const q=await c.query("SELECT status,valid_until FROM public.finance_quotes WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,qid.data]);if(!q.rows[0]||q.rows[0].status!=="SENT")throw new Error("QUOTE_NOT_SENT");
 if(decision==="accept"&&q.rows[0].valid_until&&q.rows[0].valid_until<new Date().toISOString().slice(0,10))throw new Error("QUOTE_EXPIRED");
 const status=decision==="accept"?"ACCEPTED":decision==="reject"?"REJECTED":"EXPIRED";
 const col=decision==="accept"?"accepted_at":decision==="reject"?"rejected_at":null;
 const sql=col?"UPDATE public.finance_quotes SET status=$3,"+col+"=now(),updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$4 WHERE tenant_id=$1 AND id=$2 RETURNING *":"UPDATE public.finance_quotes SET status=$3,updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$4 WHERE tenant_id=$1 AND id=$2 RETURNING *";
 const out=await c.query(sql,[id.data,qid.data,status,ctx.actor.ref]);await recordInvoiceAudit(c,ctx,"quote."+decision,"QUOTE",qid.data,{});return out.rows[0];
 });res.json({data:{quote:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&["QUOTE_NOT_SENT","QUOTE_EXPIRED"].includes(e.message))return fail(res,e.message,"Quote is not eligible for this transition.",409);next(e);}
 });
}

// Conversion produces a normal invoice draft. Fiscal tax evidence and issuance remain explicit invoice workflows.
userCommercialDocumentsRouter.post("/:tenantId/quotes/:quoteId/convert",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),qid=uuid.safeParse(req.params["quoteId"]);if(!id.success||!qid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);
 const ctx=await contextFor(id.data,req,res,"invoices:create");if(!ctx)return;
 const quote=await withTenantTransaction(id.data,async c=>{const q=await c.query("SELECT * FROM public.finance_quotes WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,qid.data]);if(!q.rows[0]||q.rows[0].status!=="ACCEPTED")throw new Error("QUOTE_NOT_ACCEPTED");const lines=await c.query("SELECT description,item_code,unit_label,line_note,quantity::text,unit_price::text,discount_percent::text,indicative_tax_rate::text FROM public.finance_quote_lines WHERE tenant_id=$1 AND quote_id=$2 ORDER BY line_number",[id.data,qid.data]);return {q:q.rows[0],lines:lines.rows};});
 const invoice=await invoiceDraftService.create(ctx,{customerId:quote.q.customer_id,currencyCode:quote.q.currency_code.trim(),notes:quote.q.notes??undefined,document:{reference:quote.q.quote_code??undefined,globalDiscountPercent:"0",globalDiscountAmount:"0"},lines:quote.lines.map((l:any)=>({description:l.description,itemCode:l.item_code??undefined,unit:l.unit_label??undefined,lineNote:l.line_note??undefined,quantity:l.quantity,unitPrice:l.unit_price,discountPercent:l.discount_percent,taxRatePercent:l.indicative_tax_rate}))});
 await withTenantTransaction(id.data,async c=>{await c.query("UPDATE public.finance_quotes SET status='CONVERTED',converted_invoice_id=$3,updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$4 WHERE tenant_id=$1 AND id=$2 AND status='ACCEPTED'",[id.data,qid.data,invoice.id,ctx.actor.ref]);await recordInvoiceAudit(c,ctx,"quote.converted","QUOTE",qid.data,{invoiceId:invoice.id});});
 res.status(201).json({data:{invoice,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&e.message==="QUOTE_NOT_ACCEPTED")return fail(res,e.message,"Only an accepted quote can be converted.",409);next(e);}
});

// Pro forma documents are independent non-fiscal records and cannot be issued as tax invoices.
userCommercialDocumentsRouter.get("/:tenantId/proformas",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]);if(!id.success)return fail(res,"INVALID_TENANT_ID","Invalid tenant ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:read");if(!ctx)return;const rows=await withTenantTransaction(id.data,c=>c.query("SELECT id,proforma_code,status,currency_code,issue_date,valid_until,grand_total,created_at FROM public.finance_proformas WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200",[id.data]));res.json({data:{proformas:rows.rows,correlationId:ctx.correlationId}});
 }catch(e){next(e);}
});
userCommercialDocumentsRouter.post("/:tenantId/proformas",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),body=documentSchema.safeParse(req.body);if(!id.success||!body.success)return fail(res,"INVALID_PROFORMA","Pro forma payload is invalid.",400);const ctx=await contextFor(id.data,req,res,"invoices:create");if(!ctx)return;
 const {currency,customer,totals,seller}=await loadCommercialDraft(id.data,body.data.customerId,body.data.currencyCode,body.data.lines,"PROFORMA");
 const result=await withTenantTransaction(id.data,async c=>{const p=await c.query("INSERT INTO public.finance_proformas(tenant_id,customer_id,currency_code,currency_minor_unit,valid_until,customer_snapshot,seller_snapshot,document_metadata,notes,subtotal,discount_total,estimated_tax_total,grand_total,created_by_actor_type,created_by_actor_ref,updated_by_actor_type,updated_by_actor_ref) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,'USER',$14,'USER',$14) RETURNING *",[id.data,customer.id,currency.code,currency.minorUnit,body.data.validUntil??null,JSON.stringify({id:customer.id,legalName:customer.legalName,displayName:customer.displayName,email:customer.email,countryCode:customer.countryCode}),JSON.stringify({legalName:seller.legal_name,tenantCode:seller.tenant_code,countryCode:seller.country_code}),JSON.stringify(body.data.document??{}),body.data.notes??null,totals.subtotal,totals.discountTotal,totals.taxTotal,totals.grandTotal,ctx.actor.ref]);const pRow=p.rows[0];for(let i=0;i<body.data.lines.length;i++){const l=body.data.lines[i]!,x=totals.lines[i]!;await c.query("INSERT INTO public.finance_proforma_lines(tenant_id,proforma_id,line_number,description,item_code,unit_label,line_note,quantity,unit_price,discount_percent,indicative_tax_rate,subtotal,discount_amount,estimated_tax_amount,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",[id.data,pRow.id,i+1,l.description,l.itemCode??null,l.unit??null,l.lineNote??null,x.quantity,x.unitPrice,x.discountPercent,x.taxRatePercent,x.subtotal,x.discountAmount,x.taxAmount,x.total]);}await recordInvoiceAudit(c,ctx,"proforma.draft.created","PROFORMA",pRow.id,{lineCount:body.data.lines.length});return pRow;});res.status(201).json({data:{proforma:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&["CURRENCY_NOT_SUPPORTED","CUSTOMER_NOT_ACTIVE"].includes(e.message))return fail(res,e.message,"Customer or currency is unavailable.",422);next(e);}
});
userCommercialDocumentsRouter.post("/:tenantId/proformas/:proformaId/issue",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["proformaId"]);if(!id.success||!pid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:issue");if(!ctx)return;
 const result=await withTenantTransaction(id.data,async c=>{const p=await c.query("SELECT * FROM public.finance_proformas WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,pid.data]);if(!p.rows[0]||p.rows[0].status!=="DRAFT")throw new Error("PROFORMA_NOT_DRAFT");const today=new Date().toISOString().slice(0,10),year=Number(today.slice(0,4));const seq=await c.query("INSERT INTO public.finance_proforma_sequences(tenant_id,fiscal_year,next_number) VALUES($1,$2,2) ON CONFLICT(tenant_id,fiscal_year) DO UPDATE SET next_number=public.finance_proforma_sequences.next_number+1 RETURNING next_number-1 AS allocated",[id.data,year]);const code="PRO-"+year+"-"+String(seq.rows[0].allocated).padStart(6,"0");const out=await c.query("UPDATE public.finance_proformas SET status='ISSUED',proforma_code=$3,issue_date=$4,updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$5 WHERE tenant_id=$1 AND id=$2 RETURNING *",[id.data,pid.data,code,today,ctx.actor.ref]);await recordInvoiceAudit(c,ctx,"proforma.issued","PROFORMA",pid.data,{proformaCode:code});return out.rows[0];});res.json({data:{proforma:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&e.message==="PROFORMA_NOT_DRAFT")return fail(res,e.message,"Only a draft pro forma can be issued.",409);next(e);}
});
