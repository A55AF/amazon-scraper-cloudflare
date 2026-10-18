import { describe, it, expect } from "vitest";
import worker from "../src/index";

// Minimal in-memory mock for D1Database
function createMockD1(): any {
  const tracked = new Map<string, any>();
  const buffer: any[] = [];

  return {
    exec: async () => {},
    prepare: (sql: string) => {
      let boundParams: any[] = [];
      const stmt = {
        bind: (...params: any[]) => {
          boundParams = params;
          return stmt;
        },
        run: async () => {
          if (sql.includes("DELETE FROM scraper_buffer")) {
            if (sql.includes("WHERE id <=")) {
              const maxId = boundParams[0];
              const remaining = buffer.filter((item) => (item.id || 0) > maxId);
              const removed = buffer.length - remaining.length;
              buffer.length = 0;
              buffer.push(...remaining);
              return { meta: { changes: removed } };
            }
            const count = buffer.length;
            buffer.length = 0;
            return { meta: { changes: count } };
          }
          if (sql.includes("INSERT INTO scraper_buffer")) {
            buffer.push({
              id: buffer.length + 1,
              asin: boundParams[0],
              country: boundParams[1],
              title: boundParams[3],
              price: boundParams[6]
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("DELETE FROM tracked_products")) {
            const key = boundParams[0];
            const changed = tracked.delete(key);
            return { meta: { changes: changed ? 1 : 0 } };
          }
          return { meta: { changes: 1 } };
        },
        all: async () => {
          if (sql.includes("FROM tracked_products")) {
            return { results: Array.from(tracked.values()) };
          }
          if (sql.includes("FROM scraper_buffer")) {
            return { results: [...buffer] };
          }
          return { results: [] };
        }
      };
      return stmt;
    },
    batch: async (stmts: any[]) => {
      for (const s of stmts) {
        await s.run();
      }
    }
  };
}

describe("D1 API Endpoints & Auth", () => {
  it("enforces MORAQEB_API_KEY when configured", async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, MORAQEB_API_KEY: "secret123" };

    const reqWithoutKey = new Request("http://localhost/api/tracked-products", {
      method: "GET"
    });
    const resp1 = await worker.fetch(reqWithoutKey, env, {} as any);
    expect(resp1.status).toBe(401);

    const reqWithBadKey = new Request("http://localhost/api/tracked-products", {
      method: "GET",
      headers: { "x-moraqeb-key": "wrong" }
    });
    const resp2 = await worker.fetch(reqWithBadKey, env, {} as any);
    expect(resp2.status).toBe(401);

    const reqWithGoodKey = new Request("http://localhost/api/tracked-products", {
      method: "GET",
      headers: { "x-moraqeb-key": "secret123" }
    });
    const resp3 = await worker.fetch(reqWithGoodKey, env, {} as any);
    expect(resp3.status).toBe(200);

    // Verify /products/details requires key when MORAQEB_API_KEY is configured
    const unauthProduct = new Request("http://localhost/products/details?product=B001");
    const resp4 = await worker.fetch(unauthProduct, env, {} as any);
    expect(resp4.status).toBe(401);

    // Verify /health is public even with MORAQEB_API_KEY configured
    const healthReq = new Request("http://localhost/health");
    const resp5 = await worker.fetch(healthReq, env, {} as any);
    expect(resp5.status).toBe(200);
  });

  it("handles /api/buffer/consume and flushes buffer", async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb };

    // Insert item to mock buffer
    await mockDb.prepare("INSERT INTO scraper_buffer").bind("B001", "EG", null, "Item 1", null, null, 100).run();

    // Consume
    const req = new Request("http://localhost/api/buffer/consume", { method: "GET" });
    const resp = await worker.fetch(req, env, {} as any);
    expect(resp.status).toBe(200);
    const data = (await resp.json()) as any;
    expect(data.count).toBe(1);
    expect(data.products[0].asin).toBe("B001");

    // Second call should return empty (flushed)
    const resp2 = await worker.fetch(req, env, {} as any);
    const data2 = (await resp2.json()) as any;
    expect(data2.count).toBe(0);
  });

  it("handles scheduled micro-batch scraping cleanly", async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb };

    // Trigger scheduled event
    const ctx = {
      waitUntil: (promise: Promise<any>) => promise,
      passThroughOnException: () => {}
    };

    await expect(worker.scheduled({} as any, env, ctx as any)).resolves.not.toThrow();
  });
});

