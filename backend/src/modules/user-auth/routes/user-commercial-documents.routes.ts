import { Router, type NextFunction, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { withTenantTransaction } from "../../../db/transaction.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../tenants/repositories/tenant.repository.js";
import { customerRepository } from "../../customers/repositories/customer.repository.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import { calculateInvoiceTotals } from "../../invoices/engine/invoice-calculation.engine.js";
import { invoiceRepository } from "../../invoices/repositories/invoice.repository.js";
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
async function loadCommercialDraft(tenantId:string,customerId:string,currencyCode:string,lines:z.infer<typeof lineSchema>[]){
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
 const {currency,customer,totals,seller}=await loadCommercialDraft(id.data,body.data.customerId,body.data.currencyCode,body.data.lines);
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
 const today=new Date().toISOString().slice(0,10);if(decision==="accept"&&q.rows[0].valid_until&&q.rows[0].valid_until<today)throw new Error("QUOTE_EXPIRED");if(decision==="expire"&&(!q.rows[0].valid_until||q.rows[0].valid_until>=today))throw new Error("QUOTE_NOT_EXPIRED");
 const status=decision==="accept"?"ACCEPTED":decision==="reject"?"REJECTED":"EXPIRED";
 const col=decision==="accept"?"accepted_at":decision==="reject"?"rejected_at":null;
 const sql=col?"UPDATE public.finance_quotes SET status=$3,"+col+"=now(),updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$4 WHERE tenant_id=$1 AND id=$2 RETURNING *":"UPDATE public.finance_quotes SET status=$3,updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$4 WHERE tenant_id=$1 AND id=$2 RETURNING *";
 const out=await c.query(sql,[id.data,qid.data,status,ctx.actor.ref]);await recordInvoiceAudit(c,ctx,"quote."+decision,"QUOTE",qid.data,{});return out.rows[0];
 });res.json({data:{quote:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&["QUOTE_NOT_SENT","QUOTE_EXPIRED","QUOTE_NOT_EXPIRED"].includes(e.message))return fail(res,e.message,"Quote is not eligible for this transition.",409);next(e);}
 });
}

// Conversion produces a normal invoice draft. Fiscal tax evidence and issuance remain explicit invoice workflows.
userCommercialDocumentsRouter.post("/:tenantId/quotes/:quoteId/convert",requireUserAuth(),async(req,res,next)=>{
 try{
  const id=uuid.safeParse(req.params["tenantId"]),qid=uuid.safeParse(req.params["quoteId"]);
  if(!id.success||!qid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);
  const ctx=await contextFor(id.data,req,res,"invoices:create");if(!ctx)return;
  const invoice=await withTenantTransaction(id.data,async c=>{
   const found=await c.query("SELECT * FROM public.finance_quotes WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,qid.data]);
   const q=found.rows[0];if(!q||q.status!=="ACCEPTED")throw new Error("QUOTE_NOT_ACCEPTED");
   const lineResult=await c.query("SELECT description,item_code,unit_label,line_note,quantity::text,unit_price::text,discount_percent::text,indicative_tax_rate::text FROM public.finance_quote_lines WHERE tenant_id=$1 AND quote_id=$2 ORDER BY line_number",[id.data,qid.data]);
   const customer=await customerRepository.findById(c,q.customer_id);
   if(!customer||customer.status!=="ACTIVE")throw new Error("CUSTOMER_NOT_ACTIVE");
   const currency=await currencyRepository.findActiveByCode(String(q.currency_code).trim());
   if(!currency)throw new Error("CURRENCY_NOT_SUPPORTED");
   const lines=lineResult.rows.map((l:any)=>({lineType:"ITEM" as const,description:l.description,...(l.item_code?{itemCode:l.item_code}:{}),...(l.unit_label?{unit:l.unit_label}:{}),...(l.line_note?{lineNote:l.line_note}:{}),quantity:l.quantity,unitPrice:l.unit_price,discountPercent:l.discount_percent,taxRatePercent:l.indicative_tax_rate}));
   const totals=calculateInvoiceTotals({currency:currency.code,currencyDecimalPlaces:currency.minorUnit,lines:lines.map(l=>({quantity:l.quantity,unitPrice:l.unitPrice,discountPercent:l.discountPercent,taxRatePercent:l.taxRatePercent}))});
   const draft=await invoiceRepository.createDraft(c,ctx,{customerId:q.customer_id,currencyCode:currency.code,...(q.notes?{notes:q.notes}:{}),document:q.quote_code?{reference:q.quote_code}:{},lines},currency.minorUnit,totals,totals.lines,customer);
   const updated=await c.query("UPDATE public.finance_quotes SET status='CONVERTED',converted_invoice_id=$3,updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$4 WHERE tenant_id=$1 AND id=$2 AND status='ACCEPTED'",[id.data,qid.data,draft.id,ctx.actor.ref]);
   if(updated.rowCount!==1)throw new Error("QUOTE_CONVERSION_CONFLICT");
   await recordInvoiceAudit(c,ctx,"quote.converted","QUOTE",qid.data,{invoiceId:draft.id});
   return draft;
  });
  res.status(201).json({data:{invoice,correlationId:ctx.correlationId}});
 }catch(e){
  if(e instanceof Error&&e.message==="QUOTE_NOT_ACCEPTED")return fail(res,e.message,"Only an accepted quote can be converted.",409);
  if(e instanceof Error&&["CUSTOMER_NOT_ACTIVE","CURRENCY_NOT_SUPPORTED"].includes(e.message))return fail(res,e.message,"Customer or currency is unavailable.",422);
  next(e);
 }
});

// Pro forma documents are independent non-fiscal records and cannot be issued as tax invoices.
userCommercialDocumentsRouter.get("/:tenantId/proformas",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]);if(!id.success)return fail(res,"INVALID_TENANT_ID","Invalid tenant ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:read");if(!ctx)return;const rows=await withTenantTransaction(id.data,c=>c.query("SELECT id,proforma_code,status,currency_code,issue_date,valid_until,grand_total,created_at FROM public.finance_proformas WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200",[id.data]));res.json({data:{proformas:rows.rows,correlationId:ctx.correlationId}});
 }catch(e){next(e);}
});
userCommercialDocumentsRouter.post("/:tenantId/proformas",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),body=documentSchema.safeParse(req.body);if(!id.success||!body.success)return fail(res,"INVALID_PROFORMA","Pro forma payload is invalid.",400);const ctx=await contextFor(id.data,req,res,"invoices:create");if(!ctx)return;
 const {currency,customer,totals,seller}=await loadCommercialDraft(id.data,body.data.customerId,body.data.currencyCode,body.data.lines);
 const result=await withTenantTransaction(id.data,async c=>{const p=await c.query("INSERT INTO public.finance_proformas(tenant_id,customer_id,currency_code,currency_minor_unit,valid_until,customer_snapshot,seller_snapshot,document_metadata,notes,subtotal,discount_total,estimated_tax_total,grand_total,created_by_actor_type,created_by_actor_ref,updated_by_actor_type,updated_by_actor_ref) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,'USER',$14,'USER',$14) RETURNING *",[id.data,customer.id,currency.code,currency.minorUnit,body.data.validUntil??null,JSON.stringify({id:customer.id,legalName:customer.legalName,displayName:customer.displayName,email:customer.email,countryCode:customer.countryCode}),JSON.stringify({legalName:seller.legal_name,tenantCode:seller.tenant_code,countryCode:seller.country_code}),JSON.stringify(body.data.document??{}),body.data.notes??null,totals.subtotal,totals.discountTotal,totals.taxTotal,totals.grandTotal,ctx.actor.ref]);const pRow=p.rows[0];for(let i=0;i<body.data.lines.length;i++){const l=body.data.lines[i]!,x=totals.lines[i]!;await c.query("INSERT INTO public.finance_proforma_lines(tenant_id,proforma_id,line_number,description,item_code,unit_label,line_note,quantity,unit_price,discount_percent,indicative_tax_rate,subtotal,discount_amount,estimated_tax_amount,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",[id.data,pRow.id,i+1,l.description,l.itemCode??null,l.unit??null,l.lineNote??null,x.quantity,x.unitPrice,x.discountPercent,x.taxRatePercent,x.subtotal,x.discountAmount,x.taxAmount,x.total]);}await recordInvoiceAudit(c,ctx,"proforma.draft.created","PROFORMA",pRow.id,{lineCount:body.data.lines.length});return pRow;});res.status(201).json({data:{proforma:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&["CURRENCY_NOT_SUPPORTED","CUSTOMER_NOT_ACTIVE"].includes(e.message))return fail(res,e.message,"Customer or currency is unavailable.",422);next(e);}
});
userCommercialDocumentsRouter.post("/:tenantId/proformas/:proformaId/issue",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["proformaId"]);if(!id.success||!pid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:issue");if(!ctx)return;
 const result=await withTenantTransaction(id.data,async c=>{const p=await c.query("SELECT * FROM public.finance_proformas WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,pid.data]);if(!p.rows[0]||p.rows[0].status!=="DRAFT")throw new Error("PROFORMA_NOT_DRAFT");const today=new Date().toISOString().slice(0,10),year=Number(today.slice(0,4));const seq=await c.query("INSERT INTO public.finance_proforma_sequences(tenant_id,fiscal_year,next_number) VALUES($1,$2,2) ON CONFLICT(tenant_id,fiscal_year) DO UPDATE SET next_number=public.finance_proforma_sequences.next_number+1 RETURNING next_number-1 AS allocated",[id.data,year]);const code="PRO-"+year+"-"+String(seq.rows[0].allocated).padStart(6,"0");const out=await c.query("UPDATE public.finance_proformas SET status='ISSUED',proforma_code=$3,issue_date=$4,updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$5 WHERE tenant_id=$1 AND id=$2 RETURNING *",[id.data,pid.data,code,today,ctx.actor.ref]);await recordInvoiceAudit(c,ctx,"proforma.issued","PROFORMA",pid.data,{proformaCode:code});return out.rows[0];});res.json({data:{proforma:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&e.message==="PROFORMA_NOT_DRAFT")return fail(res,e.message,"Only a draft pro forma can be issued.",409);next(e);}
});




const invoiceRelationshipSchema=z.object({advanceInvoiceId:uuid,relationshipType:z.enum(["ADVANCE_FOR","BALANCE_OF"]),appliedAmount:decimal,sourceReference:z.string().trim().max(160).optional()}).strict();
userCommercialDocumentsRouter.get("/:tenantId/invoices/:invoiceId/relationships",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),iid=uuid.safeParse(req.params["invoiceId"]);if(!id.success||!iid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:read");if(!ctx)return;const rows=await withTenantTransaction(id.data,c=>c.query("SELECT r.id,r.relationship_type,r.source_reference,r.applied_amount,r.created_at,r.source_invoice_id,r.related_invoice_id,a.invoice_code AS advance_invoice_code,b.invoice_code AS related_invoice_code FROM public.finance_invoice_relationships r JOIN public.finance_invoices a ON a.tenant_id=r.tenant_id AND a.id=r.source_invoice_id JOIN public.finance_invoices b ON b.tenant_id=r.tenant_id AND b.id=r.related_invoice_id WHERE r.tenant_id=$1 AND (r.source_invoice_id=$2 OR r.related_invoice_id=$2) ORDER BY r.created_at",[id.data,iid.data]));res.json({data:{relationships:rows.rows,correlationId:ctx.correlationId}});
 }catch(e){next(e);}
});
userCommercialDocumentsRouter.post("/:tenantId/invoices/:invoiceId/relationships",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),balanceId=uuid.safeParse(req.params["invoiceId"]),body=invoiceRelationshipSchema.safeParse(req.body);if(!id.success||!balanceId.success||!body.success)return fail(res,"INVALID_RELATIONSHIP","Relationship payload is invalid.",400);const ctx=await contextFor(id.data,req,res,"invoices:issue");if(!ctx)return;
 const result=await withTenantTransaction(id.data,async c=>{
 const advance=await c.query("SELECT id,customer_id,currency_code,grand_total,status FROM public.finance_invoices WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,body.data.advanceInvoiceId]);const balance=await c.query("SELECT id,customer_id,currency_code,grand_total,status FROM public.finance_invoices WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,balanceId.data]);
 const a=advance.rows[0],b=balance.rows[0];if(!a||!b||a.status!=="ISSUED"||b.status!=="ISSUED")throw new Error("RELATIONSHIP_REQUIRES_ISSUED_INVOICES");if(a.customer_id!==b.customer_id||a.currency_code!==b.currency_code)throw new Error("RELATIONSHIP_PARTY_CURRENCY_MISMATCH");
 const allocated=await c.query("SELECT COALESCE(sum(pa.amount-COALESCE(rv.amount,0)),0)::text AS amount FROM public.finance_payment_allocations pa LEFT JOIN (SELECT tenant_id,allocation_id,sum(amount) amount FROM public.finance_payment_allocation_reversals GROUP BY tenant_id,allocation_id) rv ON rv.tenant_id=pa.tenant_id AND rv.allocation_id=pa.id WHERE pa.tenant_id=$1 AND pa.invoice_id=$2",[id.data,body.data.advanceInvoiceId]);
 const amount=new Decimal(body.data.appliedAmount);if(amount.lte(0)||amount.gt(new Decimal(allocated.rows[0]?.amount??"0"))||amount.gt(new Decimal(a.grand_total)))throw new Error("ADVANCE_APPLICATION_EXCEEDS_PAID_AMOUNT");
 const inserted=await c.query("INSERT INTO public.finance_invoice_relationships(tenant_id,source_invoice_id,related_invoice_id,relationship_type,source_reference,applied_amount,created_by_actor_type,created_by_actor_ref) VALUES($1,$2,$3,$4,$5,$6,'USER',$7) RETURNING *",[id.data,body.data.advanceInvoiceId,balanceId.data,body.data.relationshipType,body.data.sourceReference??null,body.data.appliedAmount,ctx.actor.ref]);
 await recordInvoiceAudit(c,ctx,"invoice.advance_applied","INVOICE_RELATIONSHIP",inserted.rows[0].id,{advanceInvoiceId:body.data.advanceInvoiceId,balanceInvoiceId:balanceId.data,appliedAmount:body.data.appliedAmount});return inserted.rows[0];
 });res.status(201).json({data:{relationship:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&["RELATIONSHIP_REQUIRES_ISSUED_INVOICES","RELATIONSHIP_PARTY_CURRENCY_MISMATCH","ADVANCE_APPLICATION_EXCEEDS_PAID_AMOUNT"].includes(e.message))return fail(res,e.message,"The advance cannot be applied to this invoice.",409);next(e);}
});


userCommercialDocumentsRouter.get("/:tenantId/invoice-adjustments/:adjustmentId/document",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),aid=uuid.safeParse(req.params["adjustmentId"]);if(!id.success||!aid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:read");if(!ctx)return;const row=await withTenantTransaction(id.data,c=>c.query("SELECT adjustment_code,html_content,html_sha256 FROM public.finance_invoice_adjustments WHERE tenant_id=$1 AND id=$2",[id.data,aid.data]));if(!row.rows[0])return fail(res,"ADJUSTMENT_NOT_FOUND","Adjustment not found.",404);res.setHeader("Content-Type","text/html; charset=utf-8");res.setHeader("Content-Disposition",`inline; filename="${row.rows[0].adjustment_code}.html"`);res.setHeader("ETag",`"sha256-${row.rows[0].html_sha256}"`);res.setHeader("Cache-Control","private, no-store");res.send(row.rows[0].html_content);
 }catch(e){next(e);}
});
const adjustmentSchema=z.object({
 type:z.enum(["CREDIT_NOTE","DEBIT_NOTE"]),reason:z.string().trim().min(3).max(2000),
 lines:z.array(z.object({sourceInvoiceLineId:uuid,quantity:decimal}).strict()).min(1).max(500),
}).strict();
function esc(value:unknown):string{return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
userCommercialDocumentsRouter.get("/:tenantId/invoices/:invoiceId/adjustments",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),iid=uuid.safeParse(req.params["invoiceId"]);if(!id.success||!iid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:read");if(!ctx)return;const rows=await withTenantTransaction(id.data,c=>c.query("SELECT id,adjustment_code,adjustment_type,status,reason,currency_code,grand_total,amount_due,issued_at FROM public.finance_invoice_adjustments WHERE tenant_id=$1 AND original_invoice_id=$2 ORDER BY issued_at DESC",[id.data,iid.data]));res.json({data:{adjustments:rows.rows,correlationId:ctx.correlationId}});
 }catch(e){next(e);}
});
userCommercialDocumentsRouter.post("/:tenantId/invoices/:invoiceId/adjustments",requireUserAuth(),async(req,res,next)=>{
 try{
  const id=uuid.safeParse(req.params["tenantId"]),iid=uuid.safeParse(req.params["invoiceId"]),body=adjustmentSchema.safeParse(req.body);
  if(!id.success||!iid.success||!body.success)return fail(res,"INVALID_ADJUSTMENT","Adjustment request is invalid.",400);
  const ctx=await contextFor(id.data,req,res,body.data.type==="CREDIT_NOTE"?"invoices:credit":"invoices:issue");if(!ctx)return;
  const result=await withTenantTransaction(id.data,async c=>{
   const sourceResult=await c.query("SELECT id,invoice_code,status,currency_code,currency_minor_unit,customer_snapshot,grand_total,tax_snapshot_id,tax_snapshot_version FROM public.finance_invoices WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,iid.data]);
   const source=sourceResult.rows[0];if(!source||source.status!=="ISSUED"||!source.tax_snapshot_id)throw new Error("SOURCE_INVOICE_NOT_ISSUED");
   const sourceLines=await c.query("SELECT id,line_number,description,item_code,unit_label,quantity::text,unit_price::text,discount_percent::text,subtotal::text,discount_amount::text,taxable_amount::text,tax_amount::text,total::text FROM public.finance_invoice_lines WHERE tenant_id=$1 AND invoice_id=$2 ORDER BY line_number",[id.data,iid.data]);
   const byId=new Map(sourceLines.rows.map((l:any)=>[l.id,l]));const snapshots:any[]=[];
   const sum=(key:string)=>snapshots.reduce((n,l)=>n.plus(l[key]),new Decimal(0));
   for(const requested of body.data.lines){const original:any=byId.get(requested.sourceInvoiceLineId);if(!original)throw new Error("SOURCE_INVOICE_LINE_NOT_FOUND");
    const quantity=new Decimal(requested.quantity),baseQty=new Decimal(original.quantity);if(quantity.lte(0)||quantity.gt(baseQty))throw new Error("ADJUSTMENT_QUANTITY_INVALID");
    const ratio=quantity.div(baseQty);const money=(key:string)=>new Decimal(original[key]).times(ratio).toDecimalPlaces(Number(source.currency_minor_unit),Decimal.ROUND_HALF_UP).toFixed(Number(source.currency_minor_unit));
    snapshots.push({sourceInvoiceLineId:original.id,lineNumber:original.line_number,description:original.description,itemCode:original.item_code,unit:original.unit_label,quantity:quantity.toString(),unitPrice:original.unit_price,subtotal:money("subtotal"),discountAmount:money("discount_amount"),taxableAmount:money("taxable_amount"),taxAmount:money("tax_amount"),total:money("total")});
   }
   const subtotal=sum("subtotal").toFixed(8),discountTotal=sum("discountAmount").toFixed(8),taxableTotal=sum("taxableAmount").toFixed(8),taxTotal=sum("taxAmount").toFixed(8),grandTotal=sum("total").toFixed(8);
   if(new Decimal(grandTotal).lte(0))throw new Error("ADJUSTMENT_AMOUNT_INVALID");
   const year=new Date().getUTCFullYear();const seq=await c.query("INSERT INTO public.finance_invoice_adjustment_sequences(tenant_id,adjustment_type,fiscal_year,next_number) VALUES($1,$2,$3,2) ON CONFLICT(tenant_id,adjustment_type,fiscal_year) DO UPDATE SET next_number=public.finance_invoice_adjustment_sequences.next_number+1 RETURNING next_number-1 AS allocated",[id.data,body.data.type,year]);
   const prefix=body.data.type==="CREDIT_NOTE"?"CN":"DN",code=prefix+"-"+year+"-"+String(seq.rows[0].allocated).padStart(6,"0");
   const html="<!doctype html><html lang='fr'><meta charset='utf-8'><title>"+esc(code)+"</title><body><h1>"+(body.data.type==="CREDIT_NOTE"?"AVOIR":"NOTE DE DÉBIT")+"</h1><p>"+esc(code)+" · Facture source "+esc(source.invoice_code)+"</p><p>"+esc(body.data.reason)+"</p><table><tbody>"+snapshots.map(l=>"<tr><td>"+esc(l.description)+"</td><td>"+esc(l.quantity)+"</td><td>"+esc(l.total)+" "+esc(source.currency_code)+"</td></tr>").join("")+"</tbody></table><strong>"+esc(grandTotal)+" "+esc(source.currency_code)+"</strong></body></html>";
   const sha=createHash("sha256").update(html,"utf8").digest("hex");
   const inserted=await c.query("INSERT INTO public.finance_invoice_adjustments(tenant_id,original_invoice_id,adjustment_code,adjustment_type,reason,currency_code,currency_minor_unit,customer_snapshot,source_tax_snapshot_id,source_tax_snapshot_version,lines_snapshot,subtotal,discount_total,taxable_total,tax_total,grand_total,amount_due,html_content,html_sha256,issued_by_actor_type,issued_by_actor_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$16,$17,$18,'USER',$19) RETURNING id,adjustment_code,adjustment_type,status,reason,currency_code,grand_total,amount_due,issued_at",[id.data,iid.data,code,body.data.type,body.data.reason,String(source.currency_code).trim(),source.currency_minor_unit,JSON.stringify(source.customer_snapshot),source.tax_snapshot_id,source.tax_snapshot_version,JSON.stringify(snapshots),subtotal,discountTotal,taxableTotal,taxTotal,grandTotal,html,sha,ctx.actor.ref]);
   await recordInvoiceAudit(c,ctx,body.data.type==="CREDIT_NOTE"?"invoice.credit_note.issued":"invoice.debit_note.issued","INVOICE_ADJUSTMENT",inserted.rows[0].id,{sourceInvoiceId:iid.data,adjustmentCode:code,grandTotal});
   return inserted.rows[0];
  });
  res.status(201).json({data:{adjustment:result,correlationId:ctx.correlationId}});
 }catch(e){
  if(e instanceof Error&&["SOURCE_INVOICE_NOT_ISSUED","SOURCE_INVOICE_LINE_NOT_FOUND","ADJUSTMENT_QUANTITY_INVALID","ADJUSTMENT_AMOUNT_INVALID"].includes(e.message))return fail(res,e.message,"The source invoice or selected correction lines are not eligible.",422);
  if(e instanceof Error&&e.message==="CREDIT_NOTE_EXCEEDS_REMAINING_INVOICE_VALUE")return fail(res,e.message,"The credit note exceeds the remaining refundable invoice value.",409);
  next(e);
 }
});

const recurringSchema=z.object({
 customerId:uuid,currencyCode:z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
 frequency:z.enum(["WEEKLY","MONTHLY","QUARTERLY","SEMIANNUALLY","ANNUALLY"]),
 intervalCount:z.number().int().min(1).max(24).default(1),
 startsOn:z.iso.date(),endsOn:z.iso.date().optional(),dueDays:z.number().int().min(0).max(365).default(0),
 notes:z.string().trim().max(5000).optional(),document:z.record(z.string(),z.unknown()).optional(),
 lines:z.array(lineSchema).min(1).max(500),
}).strict().refine(x=>!x.endsOn||x.endsOn>=x.startsOn,{message:"End date must be on or after start date.",path:["endsOn"]});
function nextOccurrence(date:string,frequency:string,interval:number):string{
 const d=new Date(date+"T12:00:00.000Z");
 if(frequency==="WEEKLY")d.setUTCDate(d.getUTCDate()+7*interval);
 else if(frequency==="MONTHLY"||frequency==="QUARTERLY"||frequency==="SEMIANNUALLY"||frequency==="ANNUALLY"){
  const months=frequency==="MONTHLY"?1:frequency==="QUARTERLY"?3:frequency==="SEMIANNUALLY"?6:12;
  const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months*interval);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));
 }
 return d.toISOString().slice(0,10);
}
userCommercialDocumentsRouter.get("/:tenantId/recurring-invoices",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]);if(!id.success)return fail(res,"INVALID_TENANT_ID","Invalid tenant ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:read");if(!ctx)return;const rows=await withTenantTransaction(id.data,c=>c.query("SELECT id,schedule_code,status,frequency,interval_count,starts_on,ends_on,next_run_on,due_days,currency_code,created_at FROM public.finance_recurring_invoice_schedules WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200",[id.data]));res.json({data:{schedules:rows.rows,correlationId:ctx.correlationId}});
 }catch(e){next(e);}
});
userCommercialDocumentsRouter.post("/:tenantId/recurring-invoices",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),body=recurringSchema.safeParse(req.body);if(!id.success||!body.success)return fail(res,"INVALID_RECURRING_SCHEDULE","Schedule payload is invalid.",400);const ctx=await contextFor(id.data,req,res,"invoices:create");if(!ctx)return;
 const currency=await currencyRepository.findActiveByCode(body.data.currencyCode);if(!currency)return fail(res,"CURRENCY_NOT_SUPPORTED","Currency is unavailable.",422);
 const result=await withTenantTransaction(id.data,async c=>{const customer=await customerRepository.findById(c,body.data.customerId);if(!customer||customer.status!=="ACTIVE")throw new Error("CUSTOMER_NOT_ACTIVE");
 const seq=await c.query("SELECT COALESCE(max((regexp_match(schedule_code,'([0-9]+)$'))[1]::bigint),0)+1 AS n FROM public.finance_recurring_invoice_schedules WHERE tenant_id=$1",[id.data]);
 const code="REC-"+String(seq.rows[0].n).padStart(6,"0");
 const inserted=await c.query("INSERT INTO public.finance_recurring_invoice_schedules(tenant_id,customer_id,schedule_code,status,currency_code,currency_minor_unit,frequency,interval_count,starts_on,ends_on,next_run_on,due_days,auto_issue,document_metadata,notes,created_by_actor_type,created_by_actor_ref,updated_by_actor_type,updated_by_actor_ref) VALUES($1,$2,$3,'DRAFT',$4,$5,$6,$7,$8,$9,$8,$10,false,$11::jsonb,$12,'USER',$13,'USER',$13) RETURNING *",[id.data,customer.id,code,currency.code,currency.minorUnit,body.data.frequency,body.data.intervalCount,body.data.startsOn,body.data.endsOn??null,body.data.dueDays,JSON.stringify(body.data.document??{}),body.data.notes??null,ctx.actor.ref]);
 const schedule=inserted.rows[0];for(let i=0;i<body.data.lines.length;i++){const l=body.data.lines[i]!;await c.query("INSERT INTO public.finance_recurring_invoice_lines(tenant_id,schedule_id,line_number,description,item_code,unit_label,quantity,unit_price,discount_percent,tax_rate_percent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[id.data,schedule.id,i+1,l.description,l.itemCode??null,l.unit??null,l.quantity,l.unitPrice,l.discountPercent,l.taxRatePercent]);}
 await recordInvoiceAudit(c,ctx,"recurring_invoice.schedule_created","RECURRING_INVOICE_SCHEDULE",schedule.id,{lineCount:body.data.lines.length});return schedule;});
 res.status(201).json({data:{schedule:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&e.message==="CUSTOMER_NOT_ACTIVE")return fail(res,e.message,"Customer is unavailable.",422);next(e);}
});
for(const action of ["activate","pause","cancel"] as const){
 userCommercialDocumentsRouter.post("/:tenantId/recurring-invoices/:scheduleId/"+action,requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),sid=uuid.safeParse(req.params["scheduleId"]);if(!id.success||!sid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:create");if(!ctx)return;
 const allowed=action==="activate"?["DRAFT","PAUSED"]:action==="pause"?["ACTIVE"]:["DRAFT","ACTIVE","PAUSED"];
 const status=action==="activate"?"ACTIVE":action==="pause"?"PAUSED":"CANCELLED";
 const result=await withTenantTransaction(id.data,async c=>{const q=await c.query("UPDATE public.finance_recurring_invoice_schedules SET status=$3,updated_at=now(),updated_by_actor_type='USER',updated_by_actor_ref=$4 WHERE tenant_id=$1 AND id=$2 AND status=ANY($5::text[]) RETURNING *",[id.data,sid.data,status,ctx.actor.ref,allowed]);if(!q.rows[0])throw new Error("INVALID_SCHEDULE_TRANSITION");await recordInvoiceAudit(c,ctx,"recurring_invoice."+action,"RECURRING_INVOICE_SCHEDULE",sid.data,{});return q.rows[0];});res.json({data:{schedule:result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&e.message==="INVALID_SCHEDULE_TRANSITION")return fail(res,e.message,"Schedule does not allow this status transition.",409);next(e);}
 });
}
userCommercialDocumentsRouter.post("/:tenantId/recurring-invoices/:scheduleId/generate",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),sid=uuid.safeParse(req.params["scheduleId"]);if(!id.success||!sid.success)return fail(res,"INVALID_ID","Invalid resource ID.",400);const ctx=await contextFor(id.data,req,res,"invoices:create");if(!ctx)return;
 const result=await withTenantTransaction(id.data,async c=>{
  const found=await c.query("SELECT * FROM public.finance_recurring_invoice_schedules WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[id.data,sid.data]);const schedule=found.rows[0];
  if(!schedule||schedule.status!=="ACTIVE"||!schedule.next_run_on)throw new Error("SCHEDULE_NOT_ACTIVE");
  const scheduledFor=String(schedule.next_run_on).slice(0,10),today=new Date().toISOString().slice(0,10);
  if(scheduledFor>today)throw new Error("SCHEDULE_NOT_DUE");
  const existing=await c.query("SELECT invoice_id,status FROM public.finance_recurring_invoice_runs WHERE tenant_id=$1 AND schedule_id=$2 AND scheduled_for=$3",[id.data,sid.data,scheduledFor]);
  if(existing.rows[0]?.status==="GENERATED")return {invoiceId:existing.rows[0].invoice_id,alreadyGenerated:true};
  const customer=await customerRepository.findById(c,schedule.customer_id);if(!customer||customer.status!=="ACTIVE")throw new Error("CUSTOMER_NOT_ACTIVE");
  const currency=await currencyRepository.findActiveByCode(String(schedule.currency_code).trim());if(!currency)throw new Error("CURRENCY_NOT_SUPPORTED");
  const lineRows=await c.query("SELECT description,item_code,unit_label,quantity::text,unit_price::text,discount_percent::text,tax_rate_percent::text FROM public.finance_recurring_invoice_lines WHERE tenant_id=$1 AND schedule_id=$2 ORDER BY line_number",[id.data,sid.data]);
  const lines=lineRows.rows.map((l:any)=>({lineType:"ITEM" as const,description:l.description,...(l.item_code?{itemCode:l.item_code}:{}),...(l.unit_label?{unit:l.unit_label}:{}),quantity:l.quantity,unitPrice:l.unit_price,discountPercent:l.discount_percent,taxRatePercent:l.tax_rate_percent}));
  const totals=calculateInvoiceTotals({currency:currency.code,currencyDecimalPlaces:currency.minorUnit,lines:lines.map(l=>({quantity:l.quantity,unitPrice:l.unitPrice,discountPercent:l.discountPercent,taxRatePercent:l.taxRatePercent}))});
  const due=new Date(scheduledFor+"T12:00:00.000Z");due.setUTCDate(due.getUTCDate()+Number(schedule.due_days));const dueDate=due.toISOString().slice(0,10);
  const invoice=await invoiceRepository.createDraft(c,ctx,{customerId:schedule.customer_id,currencyCode:currency.code,dueDate,notes:schedule.notes??undefined,document:schedule.document_metadata??{},...(schedule.notes?{notes:schedule.notes}:{}),lines},currency.minorUnit,totals,totals.lines,customer);
  const key="recurring:"+schedule.id+":"+scheduledFor;
  await c.query("INSERT INTO public.finance_recurring_invoice_runs(tenant_id,schedule_id,scheduled_for,status,invoice_id,idempotency_key,completed_at) VALUES($1,$2,$3,'GENERATED',$4,$5,now())",[id.data,sid.data,scheduledFor,invoice.id,key]);
  const next=nextOccurrence(scheduledFor,schedule.frequency,Number(schedule.interval_count));
  const status=schedule.ends_on&&next>String(schedule.ends_on).slice(0,10)?"COMPLETED":"ACTIVE";
  await c.query("UPDATE public.finance_recurring_invoice_schedules SET status=$3,next_run_on=$4,updated_at=now(),updated_by_actor_type='SYSTEM',updated_by_actor_ref='recurring-engine' WHERE tenant_id=$1 AND id=$2",[id.data,sid.data,status,status==="COMPLETED"?null:next]);
  await recordInvoiceAudit(c,ctx,"recurring_invoice.generated","INVOICE",invoice.id,{scheduleId:schedule.id,scheduledFor});
  return {invoiceId:invoice.id,alreadyGenerated:false};
 });
 res.status(result.alreadyGenerated?200:201).json({data:{...result,correlationId:ctx.correlationId}});
 }catch(e){if(e instanceof Error&&["SCHEDULE_NOT_ACTIVE","SCHEDULE_NOT_DUE"].includes(e.message))return fail(res,e.message,"Schedule is not eligible for generation.",409);if(e instanceof Error&&["CUSTOMER_NOT_ACTIVE","CURRENCY_NOT_SUPPORTED"].includes(e.message))return fail(res,e.message,"Customer or currency is unavailable.",422);next(e);}
});
