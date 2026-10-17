-- D1 Schema for Moraqeb Scraper & Staging Buffer

CREATE TABLE IF NOT EXISTS tracked_products (
  asin TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'EG',
  title TEXT,
  added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_scraped_at TEXT,
  PRIMARY KEY (asin, country)
);

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
);

CREATE INDEX IF NOT EXISTS idx_buffer_asin ON scraper_buffer(asin, country);
