import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app.js";

describe("payments HTTP security boundary", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0,"127.0.0.1");
    await new Promise<void>((resolve,reject) => {
      server.once("listening",resolve);
      server.once("error",reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve,reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("requires valid integration credentials to create payments", async () => {
    const response = await fetch(`${baseUrl}/api/v1/payments`, {
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        amount:"100",currencyCode:"XOF",source:"MANUAL",method:"CASH",
      }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({error:{code:"UNAUTHENTICATED"}});
  });

  it("requires valid integration credentials to request refunds", async () => {
    const response = await fetch(`${baseUrl}/api/v1/payments/11111111-1111-4111-8111-111111111111/refunds`, {
      method:"POST",headers:{"content-type":"application/json","Idempotency-Key":"refund-test-key-001"},
      body:JSON.stringify({amount:"10",reason:"Duplicate transfer"}),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({error:{code:"UNAUTHENTICATED"}});
  });

  it("requires valid integration credentials to read invoice balances", async () => {
    const response = await fetch(`${baseUrl}/api/v1/invoices/11111111-1111-4111-8111-111111111111/balance`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({error:{code:"UNAUTHENTICATED"}});
  });
});
