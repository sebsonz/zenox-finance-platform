import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];
function disposable(value: string | undefined): boolean {
  if (!value) return false;
  try { const url = new URL(value); return ["localhost","127.0.0.1","::1"].includes(url.hostname) && url.pathname.replace(/^\//,"") === "finance_test"; }
  catch { return false; }
}
const suite = disposable(adminUrl) && disposable(runtimeUrl) ? describe : describe.skip;

suite("M11 documents and M22 registration compliance PostgreSQL boundaries", () => {
  let admin: Pool;
  let runtime: Pool;
  beforeAll(() => { admin = new Pool({connectionString:adminUrl}); runtime = new Pool({connectionString:runtimeUrl}); });
  afterAll(async () => { await Promise.all([admin?.end(),runtime?.end()]); });

  it("returns only approved and source-verified requirements for the requested jurisdiction and legal form", async () => {
    const code = "ITEST_" + randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
    await admin.query(
      "INSERT INTO public.finance_registration_requirements (jurisdiction_code,requirement_code,version,title,description,applies_to_legal_forms,applies_to_entity_types,is_required,accepted_document_types,source_authority,source_reference,source_verified_at,valid_from,status,approved_by,approved_at) VALUES ($1,$2,1,$3,$4,ARRAY['SARL'],ARRAY['ORGANIZATION'],true,ARRAY['BUSINESS_REGISTRATION'],$5,$6,CURRENT_DATE,CURRENT_DATE,'APPROVED','integration-test-approver',now())",
      ["ZZ",code,"Test registration proof","Disposable integration-only requirement","Integration fixture authority","ITEST primary source fixture"],
    );
    const visible = await runtime.query<{requirement_code:string;title:string}>(
      "SELECT requirement_code,title FROM public.finance_list_registration_requirements($1,$2,'ORGANIZATION',CURRENT_DATE)",
      ["ZZ","sarl"],
    );
    expect(visible.rows).toEqual([{requirement_code:code,title:"Test registration proof"}]);
    const absent = await runtime.query("SELECT * FROM public.finance_list_registration_requirements($1,NULL,'ORGANIZATION',CURRENT_DATE)",["YY"]);
    expect(absent.rows).toHaveLength(0);
    await expect(runtime.query("SELECT * FROM public.finance_registration_requirements")).rejects.toMatchObject({code:"42501"});
  });

  it("scopes private document metadata to the authenticated draft owner", async () => {
    const issuer = "https://auth.example.test";
    const subject = randomUUID();
    const draftPayload = {
      organization:{legalName:"Document Test " + randomUUID().slice(0,8),tradeName:null,legalForm:"SARL",countryCode:"BJ",defaultCurrency:"XOF",registrationNumber:null},
      address:{addressType:"REGISTERED",addressLine1:"Rue de test",addressLine2:null,city:"Cotonou",region:"Littoral",postalCode:null,countryCode:"BJ"},
      representative:{fullName:"Document Owner",role:"Gérant",email:"owner@example.test",phone:null},
      contact:{businessEmail:"contact@example.test",businessPhone:null,websiteUrl:null},
    };
    const created = await runtime.query<{draft_id:string}>(
      "SELECT draft_id FROM public.finance_create_registration_draft($1,$2,$3::jsonb)",
      [issuer,subject,JSON.stringify(draftPayload)],
    );
    const draftId = created.rows[0]?.draft_id;
    expect(draftId).toBeTruthy();

    const documentId = randomUUID();
    const inserted = await runtime.query<{id:string;status:string}>(
      "SELECT id,status FROM public.finance_create_registration_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [documentId,draftId,issuer,subject,"BUSINESS_REGISTRATION","proof.pdf","application/pdf",5,"a".repeat(64),draftId + "/" + documentId],
    );
    expect(inserted.rows[0]).toMatchObject({id:documentId,status:"UPLOADED"});

    const ownerRows = await runtime.query<{id:string}>(
      "SELECT id FROM public.finance_list_registration_documents($1,$2,$3)",
      [issuer,subject,draftId],
    );
    expect(ownerRows.rows.map((row)=>row.id)).toContain(documentId);

    const strangerRows = await runtime.query(
      "SELECT id FROM public.finance_list_registration_documents($1,$2,$3)",
      [issuer,randomUUID(),draftId],
    );
    expect(strangerRows.rows).toHaveLength(0);
    await expect(runtime.query("SELECT * FROM public.finance_registration_documents")).rejects.toMatchObject({code:"42501"});

    const removed = await runtime.query<{finance_remove_registration_document:boolean}>(
      "SELECT public.finance_remove_registration_document($1,$2,$3,$4) AS finance_remove_registration_document",
      [issuer,subject,draftId,documentId],
    );
    expect(removed.rows[0]?.finance_remove_registration_document).toBe(true);
  });
});
