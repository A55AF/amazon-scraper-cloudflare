import { describe, it, expect } from "vitest";
import { insertScrapedBuffer, consumeBuffer, ScraperBufferRow } from "../src/db";
import { runScrapingCron } from "../src/cron";
import { AmazonFetcher } from "../src/fetcher";

function createMockD1(): any {
  const buffer: ScraperBufferRow[] = [];
  const tracked = new Map<string, any>();

  return {
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
              const remaining = buffer.filter(b => (b.id || 0) > maxId);
              const count = buffer.length - remaining.length;
              buffer.length = 0;
              buffer.push(...remaining);
              return { meta: { changes: count } };
            }
            const count = buffer.length;
            buffer.length = 0;
            return { meta: { changes: count } };
          }
          if (sql.includes("INSERT INTO scraper_buffer")) {
            const row: ScraperBufferRow = {
              id: buffer.length + 1,
              asin: boundParams[0],
              country: boundParams[1],
              parent_code: boundParams[2],
              title: boundParams[3],
              brand: boundParams[4],
              link: boundParams[5],
              price: boundParams[6],
              price_formatted: boundParams[7],
              currency: boundParams[8],
              rating: boundParams[9],
              reviews_count: boundParams[10],
              seller_name: boundParams[11],
              seller_id: boundParams[12],
              seller_link: boundParams[13],
              is_fba: boundParams[14],
              in_stock: boundParams[15],
              image: boundParams[16],
              image_count: boundParams[17],
              bsr: boundParams[18],
              bsr_category: boundParams[19],
              is_best_seller: boundParams[20],
              is_amazon_choice: boundParams[21],
              bought_past_month: boundParams[22]
            };
            buffer.push(row);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
        all: async () => {
          if (sql.includes("FROM scraper_buffer")) {
            return { results: [...buffer] };
          }
          if (sql.includes("FROM tracked_products")) {
            return { results: Array.from(tracked.values()) };
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
    },
    _getBuffer: () => buffer
  };
}

describe("cron & buffer pipeline", () => {
  it("consumes buffer safely without deleting concurrently added items", async () => {
    const mockDb = createMockD1();

    // 1. Insert item 1 and item 2
    await insertScrapedBuffer(mockDb, {
      asin: "B001",
      country: "EG",
      title: "Item 1",
      price: 100,
      is_amazon_choice: 1,
      parent_code: "P001"
    });
    await insertScrapedBuffer(mockDb, {
      asin: "B002",
      country: "EG",
      title: "Item 2",
      price: 200,
      is_amazon_choice: 0,
      parent_code: null
    });

    // 2. Consume buffer (reads item 1 and item 2, id 1 and 2)
    const consumed = await consumeBuffer(mockDb);
    expect(consumed.length).toBe(2);
    expect(consumed[0].asin).toBe("B001");
    expect(consumed[0].parent_code).toBe("P001");
    expect(consumed[0].is_amazon_choice).toBe(1);

    // 3. Simulate a concurrent insertion that happened right after select
    await insertScrapedBuffer(mockDb, {
      asin: "B003",
      country: "EG",
      title: "Item 3 (concurrent)",
      price: 300
    });

    // 4. Verify that Item 3 was NOT deleted by the previous consumeBuffer
    const secondConsume = await consumeBuffer(mockDb);
    expect(secondConsume.length).toBe(1);
    expect(secondConsume[0].asin).toBe("B003");
  });
});
