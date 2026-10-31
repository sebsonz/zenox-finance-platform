import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { registrationRequirementsService } from "../application/registration-requirements.service.js";

export const registrationRequirementsRouter=Router();
const country=z.string().regex(/^[A-Za-z]{2}$/);
registrationRequirementsRouter.get("/:countryCode",requireUserAuth(),async(req,res,next)=>{
  const user=req.financeUser;
  if(!user){res.status(401).json({error:{code:"UNAUTHENTICATED"}});return;}
  if(!user.emailConfirmedAt){res.status(403).json({error:{code:"EMAIL_CONFIRMATION_REQUIRED"}});return;}
  const parsed=country.safeParse(req.params["countryCode"]);
  if(!parsed.success){res.status(400).json({error:{code:"INVALID_JURISDICTION"}});return;}
  const legalForm=typeof req.query["legalForm"]==="string"?req.query["legalForm"].trim().slice(0,80):null;
  try{
    res.setHeader("Cache-Control","no-store");
    const result=await registrationRequirementsService.list(parsed.data.toUpperCase(),legalForm);
    res.status(200).json({data:result});
  }catch(error){next(error);}
});
