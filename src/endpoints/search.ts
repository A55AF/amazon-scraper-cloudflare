import { resolveQuery, resolveNode, resolveSeller, countryOf } from "../refs";
import { parseSearchPage } from "../parsers/search";
import { AmazonFetcher, defaultFetcher } from "../fetcher";
import { context, pagedResult } from "../shared";
import { SearchPageResult, SiteConfig } from "../types";

export const PER_PAGE = 24;

export const SORTS: Record<string, string> = {
  relevance: "relevanceblender",
  price_low_to_high: "price-asc-rank",
  price_high_to_low: "price-desc-rank",
  reviews: "review-rank",
  newest: "date-desc-rank",
  best_sellers: "exact-aware-popularity-rank"
};

const CONDITION_LABELS: Record<string, string[]> = {
  new: ["new", "neu", "nuevo", "neuf", "nuovo"],
  used: ["used", "gebraucht", "usado", "d'occasion", "usato"],
  renewed: ["renewed", "refurbished", "generalüberholt", "reconditionné", "ricondizionato"],
  collectible: ["collectible", "sammler"]
};

const DEAL_LABELS: Record<string, string[]> = {
  all_discounts: ["all discounts", "all savings", "alle angebote", "toutes les"],
  todays_deals: ["today's deals", "angebote des tages", "offres du jour"],
  coupons: ["coupons", "gutscheine"],
  lightning_deals: ["lightning", "blitz"]
};

export interface SearchParams {
  query?: string | null;
  country?: string | null;
  language?: string | null;
  page?: number | string;
  sort?: string;
  category?: string | null;
  node?: string | null;
  min_price?: number | string | null;
  max_price?: number | string | null;
  brand?: string | null;
  condition?: string | null;
  is_prime?: boolean | string | null;
  four_stars_and_up?: boolean | string | null;
  deals?: string | null;
  seller?: string | null;
  fetcher?: AmazonFetcher;
}

function buildSearchParams(options: {
  query?: string | null;
  node?: string | null;
  alias?: string | null;
  page?: number;
  sort?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  brand?: string | null;
  seller?: string | null;
  extraRh?: string[];
}): Record<string, string> {
  const params: Record<string, string> = {};
  if (options.query) {
    params.k = options.query;
  }
  if (options.alias) {
    params.i = options.alias;
  }
  if (options.seller) {
    params.me = options.seller;
  }
  const rh: string[] = [];
  if (options.node) {
    rh.push(`n:${options.node}`);
  }
  if (options.brand) {
    rh.push(`p_89:${options.brand}`);
  }
  if (options.extraRh && options.extraRh.length > 0) {
    rh.push(...options.extraRh);
  }
  if (rh.length > 0) {
    params.rh = rh.join(",");
    if (options.node && !options.query) {
      params.fs = "true";
    }
  }
  if (options.minPrice !== null && options.minPrice !== undefined) {
    params["low-price"] = String(options.minPrice);
  }
  if (options.maxPrice !== null && options.maxPrice !== undefined) {
    params["high-price"] = String(options.maxPrice);
  }
  if (options.sort && options.sort !== "relevance" && SORTS[options.sort]) {
    params.s = SORTS[options.sort];
  }
  if (options.page && options.page > 1) {
    params.page = String(options.page);
  }
  return params;
}

async function getRefinementIds(
  fetcher: AmazonFetcher,
  site: SiteConfig,
  params: Record<string, string>,
  wants: Record<string, any>
): Promise<string[]> {
  const html = await fetcher.getPage(site.country, "/s", { params });
  const parsed = parseSearchPage(html, site);
  const byId = new Map(parsed.refinements.map(f => [f.id, f]));
  const picks: string[] = [];

  const optionValue = (facetId: string, labels?: string[], index?: number): string | null => {
    const facet = byId.get(facetId);
    if (!facet || !facet.options.length) {
      return null;
    }
    if (index !== undefined && index !== null && facet.options[index]) {
      const opt = facet.options[index];
      return opt.value ? `${facetId}:${opt.value}` : null;
    }
    if (labels) {
      for (const opt of facet.options) {
        const name = (opt.name || "").toLowerCase();
        if (labels.some(lbl => name.includes(lbl))) {
          return opt.value ? `${facetId}:${opt.value}` : null;
        }
      }
    }
    return null;
  };

  if (wants.is_prime) {
    const val = optionValue("p_85", undefined, 0);
    if (val) picks.push(val);
  }
  if (wants.four_stars_and_up) {
    const val = optionValue("p_72", undefined, 0);
    if (val) picks.push(val);
  }
  if (wants.condition && wants.condition !== "all") {
    const val = optionValue("p_n_condition-type", CONDITION_LABELS[wants.condition]);
    if (val) picks.push(val);
  }
  if (wants.deals) {
    const val = optionValue("p_n_deal_type", DEAL_LABELS[wants.deals]);
    if (val) picks.push(val);
  }

  return picks;
}

export async function searchProducts(params: SearchParams): Promise<SearchPageResult> {
  const fetcher = params.fetcher || defaultFetcher;
  const rawQuery = params.query ? resolveQuery(params.query) : null;
  const inferredCountry = params.country || (params.query ? countryOf(params.query) : null);
  const { site, locale } = context(inferredCountry, params.language);

  const page = Math.max(1, parseInt(String(params.page || 1), 10));
  const node = params.node ? resolveNode(params.node) : null;
  const seller = params.seller ? resolveSeller(params.seller) : null;

  const minPrice = params.min_price !== undefined && params.min_price !== null ? parseFloat(String(params.min_price)) : null;
  const maxPrice = params.max_price !== undefined && params.max_price !== null ? parseFloat(String(params.max_price)) : null;

  const isPrime = params.is_prime === true || params.is_prime === "1" || params.is_prime === "true";
  const fourStars = params.four_stars_and_up === true || params.four_stars_and_up === "1" || params.four_stars_and_up === "true";

  const wants = {
    is_prime: isPrime,
    four_stars_and_up: fourStars,
    condition: params.condition,
    deals: params.deals
  };

  const baseParams = buildSearchParams({
    query: rawQuery,
    node,
    alias: params.category,
    page,
    sort: params.sort,
    minPrice,
    maxPrice,
    brand: params.brand,
    seller
  });

  let extraRh: string[] = [];
  if (Object.values(wants).some(Boolean)) {
    const unfiltered = { ...baseParams };
    delete unfiltered.page;
    extraRh = await getRefinementIds(fetcher, site, unfiltered, wants);
    if (extraRh.length > 0) {
      const existing = baseParams.rh;
      baseParams.rh = existing ? `${existing},${extraRh.join(",")}` : extraRh.join(",");
    }
  }

  const html = await fetcher.getPage(site.country, "/s", {
    params: baseParams,
    language: locale
  });

  const parsed = parseSearchPage(html, site);
  const results = parsed.results;
  const totalPages = parsed.total_pages;
  const current = parsed.current_page || page;
  const total = parsed.total_count;
  const perPage = results.length || PER_PAGE;

  const out = pagedResult("results", results, current, perPage, null, totalPages > current, {
    query: rawQuery || undefined,
    country: site.country,
    domain: site.host
  });

  out.pagination.total_pages = totalPages || (results.length > 0 ? 1 : 0);
  out.pagination.total_count = total;
  out.is_total_approximate = parsed.is_total_approximate;
  out.results_text = parsed.results_text;
  out.departments = parsed.departments;
  out.refinements = parsed.refinements;
  out.applied_refinements = extraRh.length > 0 ? extraRh : null;

  return out as unknown as SearchPageResult;
}
