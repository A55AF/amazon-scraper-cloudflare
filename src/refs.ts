import { countryForHost } from "./sites";

const ASIN_RE = /^[A-Z0-9]{10}$/;
const ASIN_PATH_RE = /\/(?:dp|gp\/product|gp\/aw\/d|product-reviews|gp\/offer-listing|dp\/product)\/([A-Z0-9]{10})(?=[/?#]|$)/i;
const ASIN_SLUG_RE = /\/dp\/([A-Z0-9]{10})/i;
const SELLER_RE = /^A[A-Z0-9]{9,24}$/;
const HANDLE_RE = /^[A-Za-z0-9._\-]{1,80}$/;
const POST_ID_RE = /^[A-Z0-9]{8,20}$/;
const BS_PATH_RE = /\/(?:zgbs|gp\/(?:bestsellers|new-releases|movers-and-shakers|most-wished-for|most-gifted))\/([^?#]*)/i;

function isLink(value: string): boolean {
  const low = value.toLowerCase();
  return low.startsWith("http://") || low.startsWith("https://") || low.startsWith("//") || low.includes("amazon.");
}

function parseUrl(value: string): URL {
  const url = value.includes("://") ? value : `https://${value.replace(/^\/+/, "")}`;
  try {
    return new URL(url);
  } catch {
    return new URL(`https://${url}`);
  }
}

export function countryOf(value?: string | null): string | null {
  const clean = (value || "").trim();
  if (!clean || !isLink(clean)) {
    return null;
  }
  try {
    const parsed = parseUrl(clean);
    return countryForHost(parsed.hostname);
  } catch {
    return null;
  }
}

export function resolveProduct(value?: string | null): string {
  const clean = (value || "").trim();
  const upper = clean.toUpperCase();
  // An ASIN must be 10 alphanumeric chars and cannot be purely alphabetic (e.g. standard English word)
  if (ASIN_RE.test(upper) && !/^[A-Z]+$/.test(upper)) {
    return upper;
  }
  if (isLink(clean)) {
    try {
      const parsed = parseUrl(clean);
      const match = parsed.pathname.match(ASIN_PATH_RE) || parsed.pathname.match(ASIN_SLUG_RE);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
      const qAsin = parsed.searchParams.get("asin");
      if (qAsin && ASIN_RE.test(qAsin.toUpperCase())) {
        return qAsin.toUpperCase();
      }
    } catch {
      // ignore
    }
  }
  throw new Error("product must be an ASIN (e.g. B00939I7EK) or an Amazon product link (…/dp/<asin>)");
}

export function resolveSeller(value?: string | null): string {
  const clean = (value || "").trim();
  const upper = clean.toUpperCase();
  if (SELLER_RE.test(upper) && !isLink(clean)) {
    return upper;
  }
  if (isLink(clean)) {
    try {
      const parsed = parseUrl(clean);
      for (const key of ["seller", "me", "sellerID", "merchant"]) {
        const sid = parsed.searchParams.get(key);
        if (sid && SELLER_RE.test(sid.toUpperCase())) {
          return sid.toUpperCase();
        }
      }
    } catch {
      // ignore
    }
  }
  throw new Error("seller must be an Amazon seller id (e.g. A1D09S7Q0OD6TH) or a seller link (amazon.com/sp?seller=<id>)");
}

export function resolveInfluencer(value?: string | null): string {
  const clean = (value || "").trim();
  if (isLink(clean)) {
    try {
      const parsed = parseUrl(clean);
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && parts[0].toLowerCase() === "shop") {
        return parts[1];
      }
    } catch {
      // ignore
    }
    throw new Error("influencer link must look like amazon.com/shop/<name>");
  }
  const stripped = clean.replace(/^@/, "");
  if (HANDLE_RE.test(stripped)) {
    return stripped;
  }
  throw new Error("influencer must be an Amazon storefront name (e.g. tastemade) or an amazon.com/shop/<name> link");
}

export function resolvePost(value?: string | null): { handle: string | null; id: string } {
  const clean = (value || "").trim();
  if (isLink(clean)) {
    try {
      const parsed = parseUrl(clean);
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (
        parts.length >= 4 &&
        parts[0].toLowerCase() === "shop" &&
        ["list", "post", "photo", "video", "idea"].includes(parts[2].toLowerCase())
      ) {
        return { handle: parts[1], id: parts[3] };
      }
    } catch {
      // ignore
    }
    throw new Error("post link must look like amazon.com/shop/<name>/list/<id>");
  }
  if (POST_ID_RE.test(clean.toUpperCase())) {
    return { handle: null, id: clean };
  }
  throw new Error("post must be an influencer list / post id (e.g. 1N84PQ3CI4NW0) or its amazon.com/shop/<name>/list/<id> link");
}

export function resolveNode(value?: string | null): string {
  const clean = (value || "").trim();
  if (/^\d+$/.test(clean)) {
    return clean;
  }
  if (isLink(clean)) {
    try {
      const parsed = parseUrl(clean);
      const rh = decodeURIComponent(parsed.searchParams.get("rh") || "");
      const matches = Array.from(rh.matchAll(/(?:^|,)n:(\d+)/g));
      if (matches.length > 0) {
        return matches[matches.length - 1][1];
      }
      const node = parsed.searchParams.get("node");
      if (node && /^\d+$/.test(node)) {
        return node;
      }
      const pathMatch = parsed.pathname.match(/\/b\/(?:[^/]+\/)?(\d+)/) || clean.match(/node=(\d+)/);
      if (pathMatch) {
        return pathMatch[1];
      }
    } catch {
      // ignore
    }
  }
  throw new Error("category must be a numeric Amazon browse node id (e.g. 172282) or a category link (amazon.com/s?rh=n:172282, amazon.com/b?node=172282)");
}

export function resolveBestsellerCategory(value?: string | null): string {
  const clean = (value || "").trim();
  if (isLink(clean)) {
    try {
      const parsed = parseUrl(clean);
      const match = parsed.pathname.match(BS_PATH_RE);
      if (!match) {
        throw new Error("category link must be an Amazon best sellers / new releases / movers & shakers page");
      }
      let path = match[1].replace(/\/ref=.*$/, "").replace(/^\/+|\/+$/g, "");
      return path;
    } catch (e: any) {
      if (e.message && e.message.includes("category link must")) {
        throw e;
      }
    }
  }
  const path = clean.replace(/^\/+|\/+$/g, "");
  if (path === "" || path === "all" || path === "any") {
    return "";
  }
  if (/^[a-z0-9\-]+(\/\d+)?$/i.test(path)) {
    return path;
  }
  throw new Error("category must be a best sellers category alias (e.g. electronics or electronics/172541) or its link");
}

export function resolveQuery(value?: string | null): string {
  const clean = (value || "").trim();
  if (isLink(clean) && clean.toLowerCase().includes("amazon.")) {
    try {
      const parsed = parseUrl(clean);
      const keyword =
        parsed.searchParams.get("k") ||
        parsed.searchParams.get("keywords") ||
        parsed.searchParams.get("field-keywords");
      if (keyword) {
        return keyword.trim();
      }
    } catch {
      // ignore
    }
    throw new Error("search link must carry a k= keyword (amazon.com/s?k=laptop)");
  }
  if (!clean) {
    throw new Error("query must not be empty");
  }
  return clean;
}

export function resolveLink(value?: string | null): string {
  const clean = (value || "").trim();
  if (!isLink(clean) || !countryOf(clean)) {
    throw new Error("url must be a link on an Amazon marketplace (amazon.com, amazon.co.uk, amazon.de, …)");
  }
  return clean.includes("://") ? clean : `https://${clean.replace(/^\/+/, "")}`;
}

export function pageType(link: string): string | null {
  try {
    const parsed = parseUrl(link);
    const path = parsed.pathname.toLowerCase();
    const query = parsed.searchParams;
    if (ASIN_PATH_RE.test(parsed.pathname) || ASIN_SLUG_RE.test(parsed.pathname)) {
      return "product";
    }
    if (path.startsWith("/sp") && query.get("seller")) {
      return "seller";
    }
    if (path.startsWith("/shop/")) {
      const parts = path.split("/").filter(Boolean);
      return parts.length >= 4 ? "influencer_post" : "influencer";
    }
    if (BS_PATH_RE.test(parsed.pathname)) {
      return "bestsellers";
    }
    if (path.startsWith("/deals") || path.startsWith("/gp/goldbox")) {
      return "deals";
    }
    if (
      path.startsWith("/s") ||
      path.startsWith("/s/") ||
      query.get("k") ||
      query.get("me") ||
      query.get("rh") ||
      path.startsWith("/b")
    ) {
      return "search";
    }
  } catch {
    // ignore
  }
  return null;
}
