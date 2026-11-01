import { Router, type Request, type Response } from "express";
import express from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { registrationDocumentService, RegistrationDocumentError } from "../application/registration-document.service.js";

export const registrationDocumentRouter = Router({ mergeParams: true });
const uuid = z.string().uuid();
function sameOrigin(req: Request): boolean {
  const origin=req.header("origin"); if(!origin) return false;
  try { const parsed=new URL(origin); return ["https:","http:"].includes(parsed.protocol) && parsed.host.toLowerCase()===(req.get("host")??"").toLowerCase(); }
  catch { return false; }
}
function identity(req:Request,res:Response) {
  const user=req.financeUser;
  if(!user){res.status(401).json({error:{code:"UNAUTHENTICATED"}});return null;}
  if(!user.emailConfirmedAt){res.status(403).json({error:{code:"EMAIL_CONFIRMATION_REQUIRED"}});return null;}
  return {issuer:user.issuer,subject:user.id};
}
function parseDraftId(req:Request,res:Response) {
  const parsed=uuid.safeParse(req.params["draftId"]);
  if(!parsed.success){res.status(400).json({error:{code:"INVALID_DRAFT_ID"}});return null;}
  return parsed.data;
}
function sendError(error:unknown,res:Response):boolean {
  if(!(error instanceof RegistrationDocumentError)) return false;
  const status=["REGISTRATION_DRAFT_NOT_FOUND","DOCUMENT_NOT_FOUND"].includes(error.code)?404:
    ["REGISTRATION_DRAFT_NOT_EDITABLE","DOCUMENT_NOT_REMOVABLE"].includes(error.code)?409:
    error.code==="DOCUMENT_STORAGE_UNAVAILABLE"?503:422;
  res.status(status).json({error:{code:error.code,message:error.message}});return true;
}

registrationDocumentRouter.use(requireUserAuth());
registrationDocumentRouter.get("/",async(req,res,next)=>{
  const user=identity(req,res);const id=parseDraftId(req,res);if(!user||!id)return;
  try{res.setHeader("Cache-Control","no-store");res.json({data:{documents:await registrationDocumentService.list(user.issuer,user.subject,id)}});}
  catch(error){next(error);}
});
registrationDocumentRouter.post("/",(req,res,next)=>{
  if(!sameOrigin(req)){res.status(403).json({error:{code:"ORIGIN_NOT_ALLOWED"}});return;}
  express.raw({type:["application/pdf","image/jpeg","image/png"],limit:"10mb"})(req,res,next);
},async(req,res,next)=>{
  const user=identity(req,res);const id=parseDraftId(req,res);if(!user||!id)return;
  const type=z.enum(["BUSINESS_REGISTRATION","TAX_REGISTRATION","IDENTITY_DOCUMENT","PROOF_OF_ADDRESS","AUTHORIZATION_LETTER","OTHER"]).safeParse(req.header("x-document-type"));
  const filename=req.header("x-file-name");
  if(!type.success||!filename||filename.length>180||!Buffer.isBuffer(req.body)){
    res.status(400).json({error:{code:"INVALID_DOCUMENT_METADATA",message:"Le type, le nom et le contenu du fichier sont obligatoires."}});return;
  }
  try{
    const document=await registrationDocumentService.upload({issuer:user.issuer,subject:user.subject,draftId:id,type:type.data,filename,contentType:req.header("content-type")??"",bytes:req.body});
    res.status(201).json({data:{document}});
  }catch(error){if(!sendError(error,res))next(error);}
});
registrationDocumentRouter.get("/:documentId/content",async(req,res,next)=>{
  const user=identity(req,res);const id=parseDraftId(req,res);const doc=uuid.safeParse(req.params["documentId"]);if(!user||!id)return;
  if(!doc.success){res.status(404).json({error:{code:"DOCUMENT_NOT_FOUND"}});return;}
  try{
    const file=await registrationDocumentService.download(user.issuer,user.subject,id,doc.data);
    res.setHeader("Cache-Control","private,no-store");res.setHeader("Content-Type",file.contentType);
    res.setHeader("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader("X-Content-Type-Options","nosniff");
    const reader=file.body.getReader();
    while(true){const chunk=await reader.read();if(chunk.done)break;res.write(chunk.value);}
    res.end();
  }catch(error){if(!sendError(error,res))next(error);}
});
registrationDocumentRouter.delete("/:documentId",async(req,res,next)=>{
  if(!sameOrigin(req)){res.status(403).json({error:{code:"ORIGIN_NOT_ALLOWED"}});return;}
  const user=identity(req,res);const id=parseDraftId(req,res);const doc=uuid.safeParse(req.params["documentId"]);if(!user||!id)return;
  if(!doc.success){res.status(404).json({error:{code:"DOCUMENT_NOT_FOUND"}});return;}
  try{await registrationDocumentService.remove(user.issuer,user.subject,id,doc.data);res.status(204).end();}
  catch(error){if(!sendError(error,res))next(error);}
});
