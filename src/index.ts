import { D1Database, ScheduledEvent } from "@cloudflare/workers-types";
import { getProductDetails, getProductOffers } from "./endpoints/product";
import { getSellerDetails } from "./endpoints/seller";
import { searchProducts } from "./endpoints/search";
import { AmazonFetcher } from "./fetcher";
import { paginateEnvelope } from "./shared";
import {
  upsertTrackedProducts,
  getTrackedProducts,
  deleteTrackedProduct,
  consumeBuffer
} from "./db";
import { runScrapingCron } from "./cron";
import {
  AmazonNotFoundError,
  AmazonBlockedError,
  AmazonBadRequestError,
  AmazonUpstreamError
} from "./types";

// Re-export core functions and types for library usage
export * from "./types";
export * from "./sites";
export * from "./refs";
export * from "./fetcher";
export * from "./db";
export * from "./cron";
export * from "./parsers/helpers";
export * from "./parsers/product";
export * from "./parsers/offers";
export * from "./parsers/seller";
export * from "./parsers/search";
export * from "./endpoints/product";
export * from "./endpoints/seller";
export * from "./endpoints/search";

export interface Env {
  AMAZON_PROXY?: string;
  DB?: D1Database;
  MORAQEB_API_KEY?: string;
  [key: string]: any;
}

const ENDPOINTS = [
  "/products/details",
  "/products/offers",
  "/sellers/details",
  "/search",
  "/api/tracked-products",
  "/api/buffer/consume",
  "/api/cron/trigger"
];

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "*"
    }
  });
}

function checkAuth(request: Request, env: Env): Response | null {
  if (env.MORAQEB_API_KEY) {
    const key =
      request.headers.get("x-moraqeb-key") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!key || key !== env.MORAQEB_API_KEY) {
      return jsonResponse({ error: "Unauthorized: Invalid or missing API key" }, 401);
    }
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
          "access-control-allow-headers": "*"
        }
      });
    }

    const url = new URL(request.url);
    const rawPath = url.pathname.replace(/\/+$/, "") || "/";
    const path = rawPath.startsWith("/amazon") ? rawPath.slice("/amazon".length) || "/" : rawPath;

    if (path === "/" || path === "/health") {
      return jsonResponse({
        status: "ok",
        endpoints: ENDPOINTS
      });
    }

    const authErr = checkAuth(request, env);
    if (authErr) return authErr;

    // --- D1 & Cron API Endpoints ---
    if (path.startsWith("/api/")) {

      if (!env.DB) {
        return jsonResponse({ error: "D1 Database 'DB' is not bound in wrangler environment" }, 500);
      }

      if (path === "/api/tracked-products") {
        if (request.method === "POST") {
          try {
            const body = (await request.json()) as any;
            const items = Array.isArray(body)
              ? body
              : Array.isArray(body?.products)
              ? body.products
              : [body];
            const count = await upsertTrackedProducts(env.DB, items);
            return jsonResponse({ success: true, count });
          } catch (e: any) {
            return jsonResponse({ error: `Failed to save tracked products: ${e.message}` }, 400);
          }
        }
        if (request.method === "GET") {
          const rows = await getTrackedProducts(env.DB);
          return jsonResponse({ count: rows.length, products: rows });
        }
        if (request.method === "DELETE") {
          const asin = url.searchParams.get("asin");
          const country = url.searchParams.get("country");
          if (!asin) {
            return jsonResponse({ error: "asin query parameter required" }, 400);
          }
          const deleted = await deleteTrackedProduct(env.DB, asin, country);
          return jsonResponse({ success: deleted });
        }
      }

      if (path === "/api/buffer/consume" && request.method === "GET") {
        const rows = await consumeBuffer(env.DB);
        return jsonResponse({ count: rows.length, products: rows });
      }

      if (path === "/api/cron/trigger" && request.method === "POST") {
        const fetcher = new AmazonFetcher(env.AMAZON_PROXY || null);
        const result = await runScrapingCron(env.DB, fetcher);
        return jsonResponse({ success: true, ...result });
      }

      return jsonResponse({ error: `Not found: ${rawPath}` }, 404);
    }

    // --- Standard Scraper Endpoints ---
    const queryParams: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) {
      queryParams[k] = v;
    }

    const fetcher = new AmazonFetcher(env.AMAZON_PROXY || null);

    try {
      if (path === "/products/details") {
        const product = queryParams.product;
        if (!product) {
          return jsonResponse({ error: "Missing required parameter: product" }, 400);
        }
        const result = await getProductDetails({
          product,
          country: queryParams.country,
          language: queryParams.language,
          postal_code: queryParams.postal_code,
          fetcher
        });
        return jsonResponse(result);
      }

      if (path === "/products/offers") {
        const product = queryParams.product;
        if (!product) {
          return jsonResponse({ error: "Missing required parameter: product" }, 400);
        }
        const result = await getProductOffers({
          product,
          country: queryParams.country,
          language: queryParams.language,
          page: queryParams.page,
          condition: queryParams.condition,
          prime_only: queryParams.prime_only,
          postal_code: queryParams.postal_code,
          fetcher
        });
        const envelope = paginateEnvelope(result, url, queryParams);
        return jsonResponse(envelope);
      }

      if (path === "/sellers/details") {
        const seller = queryParams.seller;
        if (!seller) {
          return jsonResponse({ error: "Missing required parameter: seller" }, 400);
        }
        const result = await getSellerDetails({
          seller,
          country: queryParams.country,
          language: queryParams.language,
          fetcher
        });
        return jsonResponse(result);
      }

      if (path === "/search") {
        const query = queryParams.query;
        if (!query && !queryParams.node && !queryParams.category && !queryParams.seller) {
          return jsonResponse({ error: "Missing required parameter: query" }, 400);
        }
        const result = await searchProducts({
          query,
          country: queryParams.country,
          language: queryParams.language,
          page: queryParams.page,
          sort: queryParams.sort,
          category: queryParams.category,
          node: queryParams.node,
          min_price: queryParams.min_price,
          max_price: queryParams.max_price,
          brand: queryParams.brand,
          condition: queryParams.condition,
          is_prime: queryParams.is_prime,
          four_stars_and_up: queryParams.four_stars_and_up,
          deals: queryParams.deals,
          seller: queryParams.seller,
          fetcher
        });
        const envelope = paginateEnvelope(result, url, queryParams);
        return jsonResponse(envelope);
      }

      return jsonResponse({ error: `Not found: ${rawPath}` }, 404);
    } catch (err: any) {
      if (err instanceof AmazonNotFoundError) {
        return jsonResponse({ error: err.message || "not found" }, 404);
      }
      if (err instanceof AmazonBlockedError) {
        return jsonResponse({ error: `amazon blocked the request, retry later: ${err.message}` }, 502);
      }
      if (err instanceof AmazonUpstreamError) {
        return jsonResponse({ error: `amazon request failed: ${err.message}` }, 502);
      }
      if (err instanceof AmazonBadRequestError || err.message?.includes("must be") || err.message?.includes("Missing")) {
        return jsonResponse({ error: err.message }, 400);
      }
      return jsonResponse({ error: `${err.name || "Error"}: ${err.message}` }, 500);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.DB) return;
    const fetcher = new AmazonFetcher(env.AMAZON_PROXY || null);
    ctx.waitUntil(runScrapingCron(env.DB, fetcher));
  }
};
