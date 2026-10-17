import { D1Database } from "@cloudflare/workers-types";

export interface TrackedProductRow {
  asin: string;
  country: string;
  title?: string | null;
  added_at?: string;
  updated_at?: string;
}

export interface ScraperBufferRow {
  id?: number;
  asin: string;
  country: string;
  parent_code?: string | null;
  title?: string | null;
  brand?: string | null;
  link?: string | null;
  price?: number | null;
  price_formatted?: string | null;
  currency?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  seller_name?: string | null;
  seller_id?: string | null;
  seller_link?: string | null;
  is_fba?: number;
  in_stock?: number;
  image?: string | null;
  image_count?: number;
  bsr?: number | null;
  bsr_category?: string | null;
  is_best_seller?: number;
  is_amazon_choice?: number;
  bought_past_month?: number | null;
  raw_json?: string | null;
  scraped_at?: string;
}

let _dbInitialized = false;

export async function initDb(db: D1Database): Promise<void> {
  if (_dbInitialized) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS tracked_products (
        asin TEXT NOT NULL,
        country TEXT NOT NULL DEFAULT 'EG',
        title TEXT,
        added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (asin, country)
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS scraper_buffer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asin TEXT NOT NULL,
        country TEXT NOT NULL DEFAULT 'EG',
        parent_code TEXT,
        title TEXT,
        brand TEXT,
        link TEXT,
        price REAL,
        price_formatted TEXT,
        currency TEXT,
        rating REAL,
        reviews_count INTEGER,
        seller_name TEXT,
        seller_id TEXT,
        seller_link TEXT,
        is_fba INTEGER DEFAULT 0,
        in_stock INTEGER DEFAULT 1,
        image TEXT,
        image_count INTEGER,
        bsr INTEGER,
        bsr_category TEXT,
        is_best_seller INTEGER DEFAULT 0,
        is_amazon_choice INTEGER DEFAULT 0,
        bought_past_month INTEGER,
        raw_json TEXT,
        scraped_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `).run();

    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_buffer_asin ON scraper_buffer(asin, country)
    `).run();

    _dbInitialized = true;
  } catch (err: any) {
    console.warn("initDb warning:", err?.message || err);
  }
}

export async function upsertTrackedProducts(
  db: D1Database,
  products: Array<{ asin: string; country?: string; title?: string | null }>
): Promise<number> {
  if (!products.length) return 0;
  await initDb(db);
  const stmts = products.map((p) => {
    const country = (p.country || "EG").toUpperCase().trim();
    const asin = p.asin.toUpperCase().trim();
    return db
      .prepare(
        `INSERT INTO tracked_products (asin, country, title, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(asin, country) DO UPDATE SET
           title = COALESCE(excluded.title, tracked_products.title),
           updated_at = CURRENT_TIMESTAMP`
      )
      .bind(asin, country, p.title || null);
  });
  await db.batch(stmts);
  return products.length;
}

export async function getTrackedProducts(db: D1Database): Promise<TrackedProductRow[]> {
  await initDb(db);
  const result = await db.prepare("SELECT * FROM tracked_products ORDER BY updated_at DESC").all<TrackedProductRow>();
  return result.results || [];
}

export async function deleteTrackedProduct(
  db: D1Database,
  asin: string,
  country?: string | null
): Promise<boolean> {
  await initDb(db);
  const cleanAsin = asin.toUpperCase().trim();
  let stmt;
  if (country) {
    stmt = db.prepare("DELETE FROM tracked_products WHERE asin = ? AND country = ?").bind(cleanAsin, country.toUpperCase().trim());
  } else {
    stmt = db.prepare("DELETE FROM tracked_products WHERE asin = ?").bind(cleanAsin);
  }
  const res = await stmt.run();
  return Boolean(res.meta.changes && res.meta.changes > 0);
}

export async function insertScrapedBuffer(db: D1Database, row: ScraperBufferRow): Promise<void> {
  await initDb(db);
  await db
    .prepare(
      `INSERT INTO scraper_buffer (
        asin, country, parent_code, title, brand, link, price, price_formatted, currency,
        rating, reviews_count, seller_name, seller_id, seller_link, is_fba, in_stock,
        image, image_count, bsr, bsr_category, is_best_seller, is_amazon_choice,
        bought_past_month, raw_json, scraped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(
      row.asin.toUpperCase().trim(),
      (row.country || "EG").toUpperCase().trim(),
      row.parent_code || null,
      row.title || null,
      row.brand || null,
      row.link || null,
      row.price ?? null,
      row.price_formatted || null,
      row.currency || null,
      row.rating ?? null,
      row.reviews_count ?? null,
      row.seller_name || null,
      row.seller_id || null,
      row.seller_link || null,
      row.is_fba ? 1 : 0,
      row.in_stock ? 1 : 0,
      row.image || null,
      row.image_count ?? (row.image ? 1 : 0),
      row.bsr ?? null,
      row.bsr_category || null,
      row.is_best_seller ? 1 : 0,
      row.is_amazon_choice ? 1 : 0,
      row.bought_past_month ?? null,
      row.raw_json || null
    )
    .run();
}

export async function consumeBuffer(db: D1Database): Promise<ScraperBufferRow[]> {
  await initDb(db);
  const selectRes = await db.prepare("SELECT * FROM scraper_buffer ORDER BY id ASC").all<ScraperBufferRow>();
  const rows = selectRes.results || [];
  if (rows.length > 0) {
    await db.prepare("DELETE FROM scraper_buffer").run();
  }
  return rows;
}
