import { resolveProduct, countryOf } from "../refs";
import { parseProductPage, reviewTreatment } from "../parsers/product";
import { parseOffersPage } from "../parsers/offers";
import { AmazonFetcher, defaultFetcher } from "../fetcher";
import { context, pagedResult } from "../shared";
import { ProductDetails, OffersResult, AmazonNotFoundError } from "../types";
import { productLink } from "../parsers/helpers";

const OFFERS_PER_PAGE = 10;
const CONDITIONS: Record<string, string | null> = {
  all: null,
  new: "new",
  used: "usedAcceptable",
  used_like_new: "usedLikeNew",
  used_very_good: "usedVeryGood",
  used_good: "usedGood",
  used_acceptable: "usedAcceptable",
  collectible: "collectible"
};

export interface ProductDetailsParams {
  product: string;
  country?: string | null;
  language?: string | null;
  postal_code?: string | null;
  fetcher?: AmazonFetcher;
}

export interface ProductOffersParams {
  product: string;
  country?: string | null;
  language?: string | null;
  page?: number | string;
  condition?: string;
  prime_only?: boolean | string;
  postal_code?: string | null;
  fetcher?: AmazonFetcher;
}

export async function getProductDetails(params: ProductDetailsParams): Promise<ProductDetails> {
  const fetcher = params.fetcher || defaultFetcher;
  const inferredCountry = params.country || countryOf(params.product);
  const asin = resolveProduct(params.product);
  const { site, locale } = context(inferredCountry, params.language);

  // Attempt to fetch product page (handling review treatment retry)
  let html = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    html = await fetcher.getPage(site.country, `/dp/${asin}`, {
      params: { th: "1", psc: "1" },
      referer: `${site.base}/s?k=${asin}`,
      postal_code: params.postal_code,
      language: locale
    });
    if (html.includes('data-hook="review"')) {
      break;
    }
    if (reviewTreatment(html) === "T1" && attempt < 1) {
      // Retry once if T1 treatment lacking reviews
      continue;
    }
  }

  const data = parseProductPage(html, site);
  if (!data.title) {
    throw new AmazonNotFoundError(`product ${asin}: no product page (unavailable or removed)`);
  }
  data.asin = data.asin || asin;
  data.link = productLink(site, data.asin);
  return data;
}

export async function getProductOffers(params: ProductOffersParams): Promise<OffersResult> {
  const fetcher = params.fetcher || defaultFetcher;
  const inferredCountry = params.country || countryOf(params.product);
  const asin = resolveProduct(params.product);
  const { site, locale } = context(inferredCountry, params.language);

  const page = Math.max(1, parseInt(String(params.page || 1), 10));
  const condition = params.condition || "all";
  const primeOnly = params.prime_only === true || params.prime_only === "1" || params.prime_only === "true";

  const reqQuery: Record<string, string> = {
    asin,
    pc: "dp",
    experienceId: "aodAjaxMain"
  };

  const filters: Record<string, boolean> = {};
  const token = CONDITIONS[condition];
  if (token) {
    filters[token] = true;
  }
  if (primeOnly) {
    filters.primeEligible = true;
  }
  if (Object.keys(filters).length > 0) {
    reqQuery.filters = JSON.stringify({ all: true, ...filters });
  }
  if (page > 1) {
    reqQuery.pageno = String(page);
    reqQuery.isonlyrenderofferlist = "true";
  }

  const html = await fetcher.getAjax(site.country, "/gp/product/ajax/aodAjaxMain", {
    params: reqQuery,
    referer: productLink(site, asin),
    postal_code: params.postal_code,
    language: locale
  });

  const data = parseOffersPage(html, site);
  const rows = data.offers;
  const total = data.other_offers_count;
  const pinned = rows.filter(o => o.is_pinned);
  const totalCount = total !== null && total !== undefined ? total + pinned.length : null;

  const out = pagedResult("offers", rows, page, OFFERS_PER_PAGE, page === 1 ? totalCount : null,
    page === 1 ? data.has_more : rows.filter(o => !o.is_pinned).length >= OFFERS_PER_PAGE,
    {
      asin,
      title: data.title,
      rating: data.rating,
      condition,
      country: site.country,
      domain: site.host
    }
  );

  if (totalCount !== null) {
    out.pagination.total_count = totalCount;
    out.pagination.total_pages = total ? Math.max(Math.ceil((total + OFFERS_PER_PAGE - 1) / OFFERS_PER_PAGE), 1) : 1;
  }

  return out as OffersResult;
}
