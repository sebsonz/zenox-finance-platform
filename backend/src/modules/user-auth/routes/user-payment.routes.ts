import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../tenants/repositories/tenant.repository.js";
import type { FinancePaymentContext } from "../../payments/types/payment-operation-context.js";
import { paymentService, PaymentServiceError } from "../../payments/services/payment.service.js";
import { refundService, RefundServiceError } from "../../payments/services/refund.service.js";
import { paymentEventsService } from "../../payments/services/payment-events.service.js";
import { createPaymentSchema, listPaymentsQuerySchema, allocatePaymentSchema, reverseAllocationSchema } from "../../payments/validators/payment.schema.js";
import { createRefundSchema, recordManualRefundSuccessSchema } from "../../payments/validators/refund.schema.js";

export const userPaymentRouter=Router();
const uuid=z.string().uuid();
function fail(res:Response,code:string,message:string,status=422){res.status(status).json({error:{code,message}});}
async function contextFor(tenantId:string,req:Request,res:Response,permission:"payments:read"|"payments:record"|"payments:allocate"):Promise<FinancePaymentContext|null>{
 const user=req.financeUser;if(!user){fail(res,"UNAUTHENTICATED","Authentication required.",401);return null;}
 const membership=await userTenantMembershipRepository.findActiveMembership(tenantId,user.issuer,user.id);
 if(!membership){fail(res,"TENANT_ACCESS_DENIED","Active tenant membership required.",403);return null;}
 try{assertActiveMembershipCan(membership,permission);}catch{fail(res,"PERMISSION_DENIED","Insufficient tenant permission.",403);return null;}
 if(!await tenantRepository.findActiveById(tenantId)){fail(res,"TENANT_NOT_AVAILABLE","Tenant unavailable.",404);return null;}
 return {tenantId,correlationId:String(res.locals["correlationId"]??""),actor:{type:"USER",ref:user.issuer+"|"+user.id,membershipId:membership.id,identityIssuer:user.issuer,identitySubject:user.id}};
}
function key(req:Request,res:Response):string|null{const v=z.string().trim().min(8).max(128).safeParse(req.header("Idempotency-Key"));if(!v.success){fail(res,"INVALID_IDEMPOTENCY_KEY","An Idempotency-Key header is required.",400);return null;}return v.data;}
function serviceError(error:unknown,res:Response,next:NextFunction,correlationId:string){
 if(error instanceof PaymentServiceError||error instanceof RefundServiceError){const code=error.code;const status=["PAYMENT_NOT_FOUND","REFUND_NOT_FOUND"].includes(code)?404:["IDEMPOTENCY_KEY_REUSED","PAYMENT_NOT_PENDING","PAYMENT_NOT_CONFIRMED","PAYMENT_AMOUNT_EXCEEDED","INVOICE_BALANCE_EXCEEDED","INVOICE_NOT_ISSUED","PAYMENT_CURRENCY_MISMATCH","REFUND_AMOUNT_EXCEEDED","REFUND_NOT_REQUESTED","REFUND_NOT_APPROVED","REFUND_SELF_APPROVAL_FORBIDDEN"].includes(code)?409:422;res.status(status).json({error:{code,message:error.message,correlationId}});return;}next(error);
}
userPaymentRouter.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});

userPaymentRouter.get("/:tenantId/invoices/:invoiceId/balance",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),iid=uuid.safeParse(req.params["invoiceId"]);if(!id.success||!iid.success)return fail(res,"INVALID_ID","Invalid invoice ID.",400);const ctx=await contextFor(id.data,req,res,"payments:read");if(!ctx)return;const balance=await paymentService.invoiceBalance(ctx,iid.data);res.json({data:{balance,correlationId:ctx.correlationId}});}catch(e){serviceError(e,res,next,String(res.locals["correlationId"]??""));}
});
userPaymentRouter.get("/:tenantId/payments",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),query=listPaymentsQuerySchema.safeParse(req.query);if(!id.success||!query.success)return fail(res,"INVALID_QUERY","Payment query is invalid.",400);const ctx=await contextFor(id.data,req,res,"payments:read");if(!ctx)return;const result=await paymentService.list(ctx,query.data);res.json({data:{...result,correlationId:ctx.correlationId}});}catch(e){next(e);}
});
userPaymentRouter.post("/:tenantId/payments",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),body=createPaymentSchema.safeParse(req.body);if(!id.success||!body.success)return fail(res,"INVALID_PAYMENT","Payment payload is invalid.",400);const ctx=await contextFor(id.data,req,res,"payments:record");if(!ctx)return;const idem=key(req,res);if(!idem)return;const payment=await paymentService.create(ctx,body.data,idem);res.status(201).json({data:{payment,correlationId:ctx.correlationId}});}catch(e){serviceError(e,res,next,String(res.locals["correlationId"]??""));}
});
userPaymentRouter.post("/:tenantId/payments/:paymentId/confirm-manual",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["paymentId"]);if(!id.success||!pid.success)return fail(res,"INVALID_ID","Invalid payment ID.",400);const ctx=await contextFor(id.data,req,res,"payments:record");if(!ctx)return;const idem=key(req,res);if(!idem)return;const payment=await paymentService.confirmManual(ctx,pid.data,idem);res.json({data:{payment,correlationId:ctx.correlationId}});}catch(e){serviceError(e,res,next,String(res.locals["correlationId"]??""));}
});
userPaymentRouter.post("/:tenantId/payments/:paymentId/allocations",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["paymentId"]),body=allocatePaymentSchema.safeParse(req.body);if(!id.success||!pid.success||!body.success)return fail(res,"INVALID_ALLOCATION","Allocation payload is invalid.",400);const ctx=await contextFor(id.data,req,res,"payments:allocate");if(!ctx)return;const idem=key(req,res);if(!idem)return;const allocation=await paymentService.allocate(ctx,pid.data,body.data,idem);res.status(201).json({data:{allocation,correlationId:ctx.correlationId}});}catch(e){serviceError(e,res,next,String(res.locals["correlationId"]??""));}
});
userPaymentRouter.post("/:tenantId/payments/:paymentId/allocations/:allocationId/reverse",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["paymentId"]),aid=uuid.safeParse(req.params["allocationId"]),body=reverseAllocationSchema.safeParse(req.body);if(!id.success||!pid.success||!aid.success||!body.success)return fail(res,"INVALID_REVERSAL","Reversal payload is invalid.",400);const ctx=await contextFor(id.data,req,res,"payments:allocate");if(!ctx)return;const idem=key(req,res);if(!idem)return;const result=await paymentService.reverseAllocation(ctx,pid.data,aid.data,body.data,idem);res.status(201).json({data:{allocation:result,correlationId:ctx.correlationId}});}catch(e){serviceError(e,res,next,String(res.locals["correlationId"]??""));}
});
userPaymentRouter.get("/:tenantId/payments/:paymentId/events",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["paymentId"]);if(!id.success||!pid.success)return fail(res,"INVALID_ID","Invalid payment ID.",400);const ctx=await contextFor(id.data,req,res,"payments:read");if(!ctx)return;const events=await paymentEventsService.listPaymentEvents(ctx,pid.data,100);res.json({data:{events,correlationId:ctx.correlationId}});}catch(e){next(e);}
});
userPaymentRouter.get("/:tenantId/payments/:paymentId/refunds",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["paymentId"]);if(!id.success||!pid.success)return fail(res,"INVALID_ID","Invalid payment ID.",400);const ctx=await contextFor(id.data,req,res,"payments:read");if(!ctx)return;const refunds=await refundService.list(ctx,pid.data);res.json({data:{refunds,correlationId:ctx.correlationId}});}catch(e){next(e);}
});
userPaymentRouter.post("/:tenantId/payments/:paymentId/refunds",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["paymentId"]),body=createRefundSchema.safeParse(req.body);if(!id.success||!pid.success||!body.success)return fail(res,"INVALID_REFUND","Refund payload is invalid.",400);const ctx=await contextFor(id.data,req,res,"payments:record");if(!ctx)return;const idem=key(req,res);if(!idem)return;const refund=await refundService.request(ctx,pid.data,body.data,idem);res.status(201).json({data:{refund,correlationId:ctx.correlationId}});}catch(e){serviceError(e,res,next,String(res.locals["correlationId"]??""));}
});
userPaymentRouter.post("/:tenantId/payments/:paymentId/refunds/:refundId/approve",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["paymentId"]),rid=uuid.safeParse(req.params["refundId"]);if(!id.success||!pid.success||!rid.success)return fail(res,"INVALID_ID","Invalid refund ID.",400);const ctx=await contextFor(id.data,req,res,"payments:record");if(!ctx)return;const idem=key(req,res);if(!idem)return;const refund=await refundService.approve(ctx,pid.data,rid.data,idem);res.json({data:{refund,correlationId:ctx.correlationId}});}catch(e){serviceError(e,res,next,String(res.locals["correlationId"]??""));}
});
userPaymentRouter.post("/:tenantId/payments/:paymentId/refunds/:refundId/complete-manual",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["paymentId"]),rid=uuid.safeParse(req.params["refundId"]),body=recordManualRefundSuccessSchema.safeParse(req.body);if(!id.success||!pid.success||!rid.success||!body.success)return fail(res,"INVALID_REFUND_COMPLETION","Refund completion payload is invalid.",400);const ctx=await contextFor(id.data,req,res,"payments:record");if(!ctx)return;const idem=key(req,res);if(!idem)return;const refund=await refundService.recordManualSuccess(ctx,pid.data,rid.data,body.data,idem);res.json({data:{refund,correlationId:ctx.correlationId}});}catch(e){serviceError(e,res,next,String(res.locals["correlationId"]??""));}
});
userPaymentRouter.post("/:tenantId/payments/:paymentId/refunds/:refundId/cancel",requireUserAuth(),async(req,res,next)=>{
 try{const id=uuid.safeParse(req.params["tenantId"]),pid=uuid.safeParse(req.params["paymentId"]),rid=uuid.safeParse(req.params["refundId"]);if(!id.success||!pid.success||!rid.success)return fail(res,"INVALID_ID","Invalid refund ID.",400);const ctx=await contextFor(id.data,req,res,"payments:record");if(!ctx)return;const idem=key(req,res);if(!idem)return;const refund=await refundService.cancel(ctx,pid.data,rid.data,idem);res.json({data:{refund,correlationId:ctx.correlationId}});}catch(e){serviceError(e,res,next,String(res.locals["correlationId"]??""));}
});
