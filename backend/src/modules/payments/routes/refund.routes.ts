import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { RefundServiceError, refundService } from "../services/refund.service.js";
import { createRefundSchema, recordManualRefundSuccessSchema } from "../validators/refund.schema.js";

export const refundRouter = Router();

function key(req: Request,res: Response): string | null {
  const parsed=z.string().trim().min(8).max(128).safeParse(req.header("Idempotency-Key"));
  if(!parsed.success){res.status(400).json({error:{code:"INVALID_IDEMPOTENCY_KEY",message:"An Idempotency-Key header between 8 and 128 characters is required."}});return null;}
  return parsed.data;
}
function errorResponse(error: unknown,res: Response,next: NextFunction,correlationId: string): void {
  if(error instanceof RefundServiceError){
    const notFound=new Set(["PAYMENT_NOT_FOUND","REFUND_NOT_FOUND"]);
    const conflict=new Set(["IDEMPOTENCY_KEY_REUSED","PAYMENT_NOT_CONFIRMED","REFUND_AMOUNT_EXCEEDED","REFUND_NOT_REQUESTED","REFUND_NOT_APPROVED","REFUND_NOT_CANCELLABLE","REFUND_SELF_APPROVAL_FORBIDDEN"]);
    const forbidden=new Set(["PROVIDER_REFUND_REQUIRES_PROVIDER_ADAPTER"]);
    const status=notFound.has(error.code)?404:conflict.has(error.code)?409:(forbidden.has(error.code)||error.code==="REFUND_SELF_APPROVAL_FORBIDDEN")?403:422;
    res.status(status).json({error:{code:error.code,message:error.message,correlationId}});
    return;
  }
  next(error);
}

refundRouter.post(
  "/:paymentId/refunds",
  requireIntegrationAuth(["refunds:request"]),
  async(req:Request,res:Response,next:NextFunction):Promise<void>=>{
    const context=req.financeContext;
    if(!context){res.status(401).json({error:{code:"UNAUTHENTICATED",message:"A verified Finance context is required."}});return;}
    const paymentId=z.string().uuid().safeParse(req.params["paymentId"]);
    if(!paymentId.success){res.status(400).json({error:{code:"INVALID_PAYMENT_ID",message:"The payment ID must be a UUID."}});return;}
    const idempotencyKey=key(req,res); if(!idempotencyKey)return;
    const parsed=createRefundSchema.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:{code:"INVALID_REQUEST",message:"The refund request is invalid."}});return;}
    try{
      const refund=await refundService.request(context,paymentId.data,parsed.data,idempotencyKey);
      res.status(201).json({data:{refund,correlationId:context.correlationId}});
    }catch(error){errorResponse(error,res,next,context.correlationId);}
  },
);

refundRouter.post(
  "/:paymentId/refunds/:refundId/approve",
  requireIntegrationAuth(["refunds:approve"]),
  async(req:Request,res:Response,next:NextFunction):Promise<void>=>{
    const context=req.financeContext;
    if(!context){res.status(401).json({error:{code:"UNAUTHENTICATED",message:"A verified Finance context is required."}});return;}
    const paymentId=z.string().uuid().safeParse(req.params["paymentId"]);
    const refundId=z.string().uuid().safeParse(req.params["refundId"]);
    if(!paymentId.success||!refundId.success){res.status(400).json({error:{code:"INVALID_RESOURCE_ID",message:"Payment and refund IDs must be UUIDs."}});return;}
    const idempotencyKey=key(req,res);if(!idempotencyKey)return;
    try{
      const refund=await refundService.approve(context,paymentId.data,refundId.data,idempotencyKey);
      res.status(200).json({data:{refund,correlationId:context.correlationId}});
    }catch(error){errorResponse(error,res,next,context.correlationId);}
  },
);

refundRouter.post(
  "/:paymentId/refunds/:refundId/record-manual-success",
  requireIntegrationAuth(["refunds:record_manual"]),
  async(req:Request,res:Response,next:NextFunction):Promise<void>=>{
    const context=req.financeContext;
    if(!context){res.status(401).json({error:{code:"UNAUTHENTICATED",message:"A verified Finance context is required."}});return;}
    const paymentId=z.string().uuid().safeParse(req.params["paymentId"]);
    const refundId=z.string().uuid().safeParse(req.params["refundId"]);
    if(!paymentId.success||!refundId.success){res.status(400).json({error:{code:"INVALID_RESOURCE_ID",message:"Payment and refund IDs must be UUIDs."}});return;}
    const idempotencyKey=key(req,res);if(!idempotencyKey)return;
    const parsed=recordManualRefundSuccessSchema.safeParse(req.body ?? {});
    if(!parsed.success){res.status(400).json({error:{code:"INVALID_REQUEST",message:"The manual refund result is invalid."}});return;}
    try{
      const refund=await refundService.recordManualSuccess(context,paymentId.data,refundId.data,parsed.data,idempotencyKey);
      res.status(200).json({data:{refund,correlationId:context.correlationId}});
    }catch(error){errorResponse(error,res,next,context.correlationId);}
  },
);

refundRouter.post(
  "/:paymentId/refunds/:refundId/cancel",
  requireIntegrationAuth(["refunds:cancel"]),
  async(req:Request,res:Response,next:NextFunction):Promise<void>=>{
    const context=req.financeContext;
    if(!context){res.status(401).json({error:{code:"UNAUTHENTICATED",message:"A verified Finance context is required."}});return;}
    const paymentId=z.string().uuid().safeParse(req.params["paymentId"]);
    const refundId=z.string().uuid().safeParse(req.params["refundId"]);
    if(!paymentId.success||!refundId.success){res.status(400).json({error:{code:"INVALID_RESOURCE_ID",message:"Payment and refund IDs must be UUIDs."}});return;}
    const idempotencyKey=key(req,res);if(!idempotencyKey)return;
    try{
      const refund=await refundService.cancel(context,paymentId.data,refundId.data,idempotencyKey);
      res.status(200).json({data:{refund,correlationId:context.correlationId}});
    }catch(error){errorResponse(error,res,next,context.correlationId);}
  },
);
