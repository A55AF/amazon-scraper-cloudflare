import { describe, it, expect } from "vitest";
import {
  getTrackedProductsForScraping,
  insertScrapedBuffer,
  consumeBuffer,
  ScraperBufferRow
} from "../src/db";
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
          if (sql.includes("INSERT INTO tracked_products")) {
            const asin = boundParams[0];
            const country = boundParams[1] || "EG";
            const lastScraped = boundParams[2] || null;
            tracked.set(`${asin}_${country}`, {
              asin,
              country,
              title: null,
              added_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_scraped_at: lastScraped
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
        all: async () => {
          if (sql.includes("FROM scraper_buffer")) {
            return { results: [...buffer] };
          }
          if (sql.includes("FROM tracked_products")) {
            if (sql.includes("last_scraped_at IS NULL OR last_scraped_at <=")) {
              const minHours = boundParams[0] ?? 3;
              const limit = boundParams[1] ?? 5;
              const cutoff = new Date(Date.now() - minHours * 3600 * 1000).toISOString();
              const eligible = Array.from(tracked.values()).filter((p: any) => {
                if (!p.last_scraped_at) return true;
                return p.last_scraped_at <= cutoff;
              });
              eligible.sort((a: any, b: any) => {
                if (!a.last_scraped_at && b.last_scraped_at) return -1;
                if (a.last_scraped_at && !b.last_scraped_at) return 1;
                if (a.last_scraped_at && b.last_scraped_at) {
                  return a.last_scraped_at.localeCompare(b.last_scraped_at);
                }
                return 0;
              });
              return { results: eligible.slice(0, limit) };
            }
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

  it("selects only products not scraped within the last 3 hours (or never scraped)", async () => {
    const mockDb = createMockD1();

    // 1. Never scraped -> eligible
    await mockDb
      .prepare("INSERT INTO tracked_products (asin, country, last_scraped_at) VALUES (?, ?, ?)")
      .bind("NEVER_SCRAPED", "EG", null)
      .run();

    // 2. Scraped 4 hours ago -> eligible
    const fourHoursAgo = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
    await mockDb
      .prepare("INSERT INTO tracked_products (asin, country, last_scraped_at) VALUES (?, ?, ?)")
      .bind("SCRAPED_4H_AGO", "EG", fourHoursAgo)
      .run();

    // 3. Scraped 15 minutes ago -> NOT eligible
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await mockDb
      .prepare("INSERT INTO tracked_products (asin, country, last_scraped_at) VALUES (?, ?, ?)")
      .bind("SCRAPED_15M_AGO", "EG", fifteenMinsAgo)
      .run();

    // Query with default 3 hours limit 5
    const products = await getTrackedProductsForScraping(mockDb, 5, 3);
    expect(products.map((p: any) => p.asin)).toEqual(["NEVER_SCRAPED", "SCRAPED_4H_AGO"]);

    // If threshold is 5 hours, 4h ago is excluded so only NEVER_SCRAPED is returned
    const filteredOut = await getTrackedProductsForScraping(mockDb, 5, 5);
    expect(filteredOut.map((p: any) => p.asin)).toEqual(["NEVER_SCRAPED"]);
  });
});

