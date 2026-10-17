import { site as getSite } from "./sites";
import { SiteConfig, Pagination } from "./types";

export function context(country?: string | null, language?: string | null): { site: SiteConfig; locale: string } {
  const s = getSite(country);
  let locale = s.language;
  if (language) {
    const parts = language.replace(/_/g, "-").split("-");
    const lang = parts[0].toLowerCase();
    const region = parts[1] ? parts[1].toUpperCase() : s.language.split("_")[1] || "US";
    locale = `${lang}_${region}`;
  }
  return { site: s, locale };
}

export function buildPagination(
  page: number,
  perPage: number,
  total?: number | null,
  hasMore?: boolean | null
): Pagination {
  let totalPages = page;
  if (total !== undefined && total !== null && perPage > 0) {
    totalPages = Math.max(Math.ceil(total / perPage), total > 0 ? 1 : 0);
  } else if (hasMore !== undefined && hasMore !== null) {
    totalPages = hasMore ? page + 1 : page;
  }
  return {
    page,
    items_per_page: perPage,
    total_pages: totalPages,
    total_count: total !== undefined ? total : null
  };
}

export function pagedResult<T>(
  key: string,
  results: T[],
  page: number,
  perPage: number,
  total?: number | null,
  hasMore?: boolean | null,
  extra: Record<string, any> = {}
): Record<string, any> {
  const effectiveHasMore = hasMore === undefined && total === undefined ? results.length >= perPage : hasMore;
  return {
    ...extra,
    [key]: results,
    pagination: buildPagination(page, perPage, total, effectiveHasMore)
  };
}

export function paginateEnvelope(
  result: Record<string, any>,
  url: URL,
  params: Record<string, any>
): Record<string, any> {
  const pagination: Pagination = result.pagination || {
    page: 1,
    items_per_page: 20,
    total_pages: 0,
    total_count: null
  };
  delete result.pagination;

  const page = Number(pagination.page || params.page || 1);
  const totalPages = Number(pagination.total_pages || 0);

  const getPageLink = (targetPage: number | null): string | null => {
    if (!targetPage) return null;
    const nextUrl = new URL(url.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        nextUrl.searchParams.set(k, String(v));
      }
    }
    nextUrl.searchParams.set("page", String(targetPage));
    return nextUrl.toString();
  };

  return {
    count: pagination.total_count,
    per_page: pagination.items_per_page,
    current_page: page,
    total_pages: totalPages,
    next: getPageLink(page < totalPages ? page + 1 : null),
    previous: getPageLink(page > 1 ? page - 1 : null),
    ...result
  };
}
