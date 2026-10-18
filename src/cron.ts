import { D1Database } from "@cloudflare/workers-types";
import { getTrackedProductsForScraping, markProductScraped, insertScrapedBuffer, ScraperBufferRow } from "./db";
import { getProductDetails } from "./endpoints/product";
import { AmazonFetcher } from "./fetcher";

export interface CronRunResult {
  total: number;
  scraped: number;
  failed: number;
  errors: Array<{ asin: string; error: string }>;
}

export async function runScrapingCron(
  db: D1Database,
  fetcher?: AmazonFetcher,
  batchSize = 5,
  delayBetweenMs?: number,
  minIntervalHours = 3
): Promise<CronRunResult> {
  const tracked = await getTrackedProductsForScraping(db, batchSize, minIntervalHours);
  const result: CronRunResult = {
    total: tracked.length,
    scraped: 0,
    failed: 0,
    errors: []
  };

  for (let i = 0; i < tracked.length; i++) {
    const item = tracked[i];

    // Add jitter delay between requests (500-1000ms) to prevent bot-detection without timing out worker
    if (i > 0) {
      const waitMs = delayBetweenMs !== undefined ? delayBetweenMs : 500 + Math.floor(Math.random() * 500);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    try {
      const data = await getProductDetails({
        product: item.asin,
        country: item.country || "EG",
        fetcher
      });

      const firstImage = data.images && data.images.length > 0 ? data.images[0].link : null;
      const bsrEntry = data.best_sellers_rank && data.best_sellers_rank.length > 0 ? data.best_sellers_rank[0] : null;

      const row: ScraperBufferRow = {
        asin: item.asin,
        country: item.country || "EG",
        parent_code: data.parent_asin || data.variations?.parent_asin || null,
        title: data.title || null,
        brand: data.brand?.name || null,
        link: data.link || null,
        price: data.price?.amount ?? null,
        price_formatted:
          data.price?.amount !== null && data.price?.amount !== undefined
            ? `${data.price.amount} ${data.price.currency || ""}`.trim()
            : null,
        currency: data.price?.currency || null,
        rating: data.rating?.average ?? null,
        reviews_count: data.rating?.count ?? null,
        seller_name: data.buybox?.seller?.name || null,
        seller_id: data.buybox?.seller?.id || null,
        seller_link: data.buybox?.seller?.link || null,
        is_fba: data.buybox?.is_fulfilled_by_amazon ? 1 : 0,
        in_stock: data.availability?.is_in_stock ? 1 : 0,
        image: firstImage,
        image_count: data.images?.length || 0,
        bsr: bsrEntry?.rank ?? null,
        bsr_category: bsrEntry?.category ?? null,
        is_best_seller: data.badges?.is_best_seller ? 1 : 0,
        is_amazon_choice: (data.badges?.is_amazons_choice || (data.badges as any)?.is_amazon_choice) ? 1 : 0,
        bought_past_month: data.bought_past_month ?? null
      };

      await insertScrapedBuffer(db, row);
      result.scraped++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ asin: item.asin, error: err.message || String(err) });
    } finally {
      // Rotate this product to the back of the queue (even on error) to prevent starving other items
      await markProductScraped(db, item.asin, item.country || "EG").catch(() => {});
    }
  }

  return result;
}
