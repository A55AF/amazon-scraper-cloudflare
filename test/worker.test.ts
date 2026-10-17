import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("worker fetch handler", () => {
  it("handles /health and /", async () => {
    const req = new Request("http://localhost/health");
    const resp = await worker.fetch(req, {}, {} as any);
    expect(resp.status).toBe(200);
    const data = (await resp.json()) as any;
    expect(data.status).toBe("ok");
    expect(data.endpoints).toContain("/products/details");
    expect(data.endpoints).toContain("/products/offers");
    expect(data.endpoints).toContain("/sellers/details");
    expect(data.endpoints).toContain("/search");
  });

  it("handles /amazon/health alias", async () => {
    const req = new Request("http://localhost/amazon/health");
    const resp = await worker.fetch(req, {}, {} as any);
    expect(resp.status).toBe(200);
    const data = (await resp.json()) as any;
    expect(data.status).toBe("ok");
  });

  it("returns 400 when required params are missing", async () => {
    const r1 = await worker.fetch(new Request("http://localhost/products/details"), {}, {} as any);
    expect(r1.status).toBe(400);
    expect((await r1.json() as any).error).toContain("Missing required parameter: product");

    const r2 = await worker.fetch(new Request("http://localhost/products/offers"), {}, {} as any);
    expect(r2.status).toBe(400);
    expect((await r2.json() as any).error).toContain("Missing required parameter: product");

    const r3 = await worker.fetch(new Request("http://localhost/sellers/details"), {}, {} as any);
    expect(r3.status).toBe(400);
    expect((await r3.json() as any).error).toContain("Missing required parameter: seller");

    const r4 = await worker.fetch(new Request("http://localhost/search"), {}, {} as any);
    expect(r4.status).toBe(400);
    expect((await r4.json() as any).error).toContain("Missing required parameter: query");
  });

  it("returns 404 for unknown endpoints", async () => {
    const resp = await worker.fetch(new Request("http://localhost/unknown/route"), {}, {} as any);
    expect(resp.status).toBe(404);
  });
});
