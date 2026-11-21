import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/db/pool.js", () => ({ pool: { query: vi.fn() } }));
import { pool } from "../../src/db/pool.js";
import { platformUserDirectoryRepository } from "../../src/modules/platform-admin/repositories/platform-user-directory.repository.js";
describe("platformUserDirectoryRepository", () => {
 beforeEach(()=>vi.clearAllMocks());
 it("calls the guarded directory function with bounded request parameters",async()=>{
  vi.mocked(pool.query).mockResolvedValue({rows:[{result:{items:[],total:0,page:2,pageSize:25}}]} as never);
  const result=await platformUserDirectoryRepository.list({operatorIssuer:"https://auth.example",operatorSubject:"subject-1",page:2,pageSize:25,query:"test@example.com",status:"ACTIVE"});
  expect(pool.query).toHaveBeenCalledWith("SELECT public.finance_list_platform_user_directory($1, $2, $3, $4, $5, $6) AS result",["https://auth.example","subject-1",2,25,"test@example.com","ACTIVE"]);
  expect(result).toEqual({items:[],total:0,page:2,pageSize:25});
 });
 it("normalizes the all-status filter to null and tolerates an empty function result",async()=>{
  vi.mocked(pool.query).mockResolvedValue({rows:[{result:null}]} as never);
  const result=await platformUserDirectoryRepository.list({operatorIssuer:"issuer",operatorSubject:"subject",page:1,pageSize:25,query:"",status:"ALL"});
  expect(vi.mocked(pool.query).mock.calls[0]?.[1]).toEqual(["issuer","subject",1,25,null,null]);
  expect(result).toEqual({items:[],total:0,page:1,pageSize:25});
 });
});
