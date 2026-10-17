import { getProductDetails, getProductOffers } from "./endpoints/product";
import { getSellerDetails } from "./endpoints/seller";
import { searchProducts } from "./endpoints/search";
import { AmazonFetcher } from "./fetcher";
import { paginateEnvelope } from "./shared";
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
  [key: string]: any;
}

const ENDPOINTS = [
  "/products/details",
  "/products/offers",
  "/sellers/details",
  "/search"
];

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "*"
    }
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
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
  }
};
