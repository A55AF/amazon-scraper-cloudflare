import * as cheerio from "cheerio";
import { SiteConfig, Money } from "../types";

const AMOUNT_START_RE = /\d[\d.,  \s]*/;
const WS_RE = /\s+/g;
const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|product-reviews)\/([A-Z0-9]{10})(?:[/?]|$)/;
const NODE_RE = /(?:node=|rh=n(?:%3A|:))(\d+)/;
const RATING_RE = /(\d+(?:[.,]\d+)?)\s*(?:out of|von|sur|su|de|of|من)\s*[5٥]/i;
const COUNT_RE = /(\d[\d,.\s ]*)/;
const PERCENT_RE = /(-?\d+(?:[.,]\d+)?)\s*%/;
const BOUGHT_KEYWORD_RE = /(?:bought|purchased|gekauft|comprado|achetés|acquistato|تم شراء|تم شراؤها)/i;
const BOUGHT_RE = /(?:(?:تم شراء|تم شراؤها)\s*(?:أكثر من\s*)?)?(\d+(?:[.,]\d+)?)\s*(K|M|ألف|k|m)?/i;
const IMAGE_SIZE_RE = /\._[^./]+_(?=\.[a-z]+$)/;

const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD", "US$": "USD", "£": "GBP", "€": "EUR", "₹": "INR", "¥": "JPY", "￥": "JPY",
  "C$": "CAD", "CDN$": "CAD", "A$": "AUD", "AU$": "AUD", "S$": "SGD", "R$": "BRL", "MX$": "MXN",
  "kr": "SEK", "zł": "PLN", "TL": "TRY", "AED": "AED", "SAR": "SAR", "EGP": "EGP", "R": "ZAR",
  "ج.م.": "EGP", "ج.م": "EGP", "جنيه": "EGP", "ر.س": "SAR", "ريال": "SAR", "د.إ": "AED", "درهم": "AED",
  "SEK": "SEK", "PLN": "PLN", "USD": "USD", "EUR": "EUR", "GBP": "GBP", "INR": "INR", "JPY": "JPY",
  "CAD": "CAD", "AUD": "AUD", "SGD": "SGD", "BRL": "BRL", "MXN": "MXN", "TRY": "TRY", "ZAR": "ZAR"
};

const DOLLAR_CURRENCIES = new Set(["USD", "AUD", "CAD", "SGD", "MXN"]);

const MONTH_NAMES: Record<string, string> = {
  january: "01", jan: "01",
  february: "02", feb: "02",
  march: "03", mar: "03",
  april: "04", apr: "04",
  may: "05",
  june: "06", jun: "06",
  july: "07", jul: "07",
  august: "08", aug: "08",
  september: "09", sep: "09", sept: "09",
  october: "10", oct: "10",
  november: "11", nov: "11",
  december: "12", dec: "12"
};

export function normalizeArabicNumerals(str?: string | null): string {
  if (!str) return "";
  return String(str)
    .replace(/[٠-٩]/g, (d) => "0123456789"[d.charCodeAt(0) - 1632])
    .replace(/[۰-۹]/g, (d) => "0123456789"[d.charCodeAt(0) - 1776])
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

export function clean(value?: any): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  let str = String(value)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "") // zero-width marks and bidi overrides
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(WS_RE, " ")
    .trim();
  return str || null;
}

export function parseAmount(text?: any): number | null {
  if (!text) {
    return null;
  }
  const str = normalizeArabicNumerals(String(text));
  const m = str.match(AMOUNT_START_RE);
  if (!m || m.index === undefined) {
    return null;
  }
  const negative = /[-−–]\s*[^\d]*$/.test(str.slice(0, m.index));
  let s = m[0].replace(/[\s  ]/g, "");

  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // 8.104,64 (comma decimal)
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // 8,104.64 (dot decimal)
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    const lastIdx = s.lastIndexOf(",");
    const head = s.slice(0, lastIdx);
    const tail = s.slice(lastIdx + 1);
    if (!head.includes(",") && (tail.length === 1 || tail.length === 2)) {
      // 1353,5 (comma decimal)
      s = head + "." + tail;
    } else {
      // 40,524 (grouping)
      s = s.replace(/,/g, "");
    }
  } else if (
    (s.match(/\./g) || []).length > 1 ||
    ((s.match(/\./g) || []).length === 1 && s.slice(s.lastIndexOf(".") + 1).length === 3)
  ) {
    // 8.104 (dot grouping)
    s = s.replace(/\./g, "");
  }

  const val = parseFloat(s);
  if (isNaN(val)) {
    return null;
  }
  return negative ? -val : val;
}

export function toInt(value?: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return Math.floor(value);
  }
  const norm = normalizeArabicNumerals(String(value));
  const match = norm.match(COUNT_RE);
  if (!match) {
    return null;
  }
  const digits = match[1].replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

export function toFloat(value?: any, digits: number = 2): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    const norm = normalizeArabicNumerals(String(value));
    const num = parseFloat(norm.replace(",", "."));
    if (isNaN(num)) {
      return null;
    }
    const factor = Math.pow(10, digits);
    return Math.round(num * factor) / factor;
  } catch {
    return null;
  }
}

export function ratingOf(value?: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = normalizeArabicNumerals(String(value));
  const match = str.match(RATING_RE);
  if (match) {
    return toFloat(match[1], 1);
  }
  const directMatch = str.match(/^\s*(\d(?:[.,]\d)?)\s*$/);
  return directMatch ? toFloat(directMatch[1], 1) : null;
}

export function percentOf(value?: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const norm = normalizeArabicNumerals(String(value));
  const match = norm.match(PERCENT_RE);
  return match ? toFloat(match[1], 1) : null;
}

export function money(value?: any, currency?: string | null): Money | null {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = clean(value);
  if (!raw) {
    return null;
  }
  const amount = parseAmount(raw);
  if (amount === null) {
    return null;
  }
  let code = currency || "USD";
  const sortedSymbols = Object.entries(CURRENCY_SYMBOLS).sort((a, b) => b[0].length - a[0].length);
  for (const [symbol, iso] of sortedSymbols) {
    if (raw.includes(symbol)) {
      if (symbol === "$" && currency && DOLLAR_CURRENCIES.has(currency)) {
        code = currency;
        break;
      }
      code = iso;
      break;
    }
  }
  return { amount, currency: code };
}

export function amountOf(value?: any): number | null {
  const m = money(value);
  return m ? m.amount : null;
}

export function isoDate(value?: any): string | null {
  const str = clean(value);
  if (!str) {
    return null;
  }
  // Try YYYY-MM-DD
  const ymd = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }

  // Try Japanese YYYY年MM月DD日
  const jp = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jp) {
    return `${jp[1]}-${jp[2].padStart(2, "0")}-${jp[3].padStart(2, "0")}`;
  }

  // Normalize: remove dots, commas, "de", etc.
  const cleaned = str.replace(/[.,]/g, "").replace(/\bde\b/gi, "").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ");

  if (parts.length >= 3) {
    // Check if month is at index 0 (Month DD YYYY)
    const m0 = MONTH_NAMES[parts[0].toLowerCase()];
    if (m0 && /^\d{1,2}$/.test(parts[1]) && /^\d{4}$/.test(parts[2])) {
      return `${parts[2]}-${m0}-${parts[1].padStart(2, "0")}`;
    }
    // Check if month is at index 1 (DD Month YYYY)
    const m1 = MONTH_NAMES[parts[1].toLowerCase()];
    if (m1 && /^\d{1,2}$/.test(parts[0]) && /^\d{4}$/.test(parts[2])) {
      return `${parts[2]}-${m1}-${parts[0].padStart(2, "0")}`;
    }
  }

  // Try standard Date parsing as fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function boughtPastMonth(value?: any): number | null {
  if (!value) {
    return null;
  }
  const str = String(value);
  if (!BOUGHT_KEYWORD_RE.test(str)) {
    return null;
  }
  const norm = normalizeArabicNumerals(str);
  const match = norm.match(BOUGHT_RE);
  if (!match) {
    return null;
  }
  const number = toFloat(match[1], 2) || 0;
  const unit = (match[2] || "").toUpperCase();
  const multiplier = unit === "K" || unit === "ألف" ? 1000 : unit === "M" ? 1000000 : 1;
  return Math.floor(number * multiplier);
}

export function snake(label?: string | null): string | null {
  const c = clean(label) || "";
  const s = c
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const res = s.replace(/_+/g, "_");
  return res || null;
}

export function absolute(site: SiteConfig, href?: string | null): string | null {
  let cleanHref = clean(href);
  if (!cleanHref || cleanHref.startsWith("javascript:") || cleanHref.startsWith("#")) {
    return null;
  }
  if (cleanHref.startsWith("/sspa/click")) {
    try {
      const u = new URL(cleanHref, site.base);
      const target = u.searchParams.get("url");
      if (target) {
        cleanHref = decodeURIComponent(target);
      }
    } catch {
      // ignore
    }
  }
  let fullUrl = "";
  try {
    fullUrl = new URL(cleanHref, site.base + "/").toString();
  } catch {
    return null;
  }
  fullUrl = fullUrl.replace(/\/ref=[^/?#]*/, "");
  try {
    const parsed = new URL(fullUrl);
    const droppedParams = new Set([
      "ref", "ref_", "qid", "sr", "dib", "dib_tag", "keywords", "sp_csd", "psc", "th", "pd_rd_i",
      "pd_rd_r", "pd_rd_w", "pd_rd_wg", "pf_rd_p", "pf_rd_r", "tag", "linkCode", "creativeASIN",
      "_encoding", "ie", "crid", "sprefix", "content-id", "smid", "pdp_new", "ds", "rnid", "dc",
      "field-lbr_brands_browse-bin", "lp_asin", "store_ref"
    ]);
    const newParams = new URLSearchParams();
    for (const [k, v] of parsed.searchParams.entries()) {
      if (!droppedParams.has(k)) {
        newParams.append(k, v);
      }
    }
    parsed.search = newParams.toString();
    return parsed.toString().replace(/\?$/, "");
  } catch {
    return fullUrl;
  }
}

export function productLink(site: SiteConfig, asin?: string | null): string {
  return asin ? `${site.base}/dp/${asin}` : "";
}

export function asinIn(href?: string | null): string | null {
  const match = (href || "").match(ASIN_RE);
  return match ? match[1] : null;
}

export function nodeIn(href?: string | null): string | null {
  if (!href) return null;
  try {
    const unquoted = decodeURIComponent(href);
    const queryIdx = unquoted.indexOf("?");
    const search = queryIdx >= 0 ? unquoted.slice(queryIdx + 1) : unquoted;
    const params = new URLSearchParams(search);
    const rh = params.get("rh") || "";
    const matches = Array.from(rh.matchAll(/(?:^|,)n:(\d+)/g));
    if (matches.length > 0) {
      return matches[matches.length - 1][1];
    }
    const node = params.get("node");
    if (node && /^\d+$/.test(node)) {
      return node;
    }
    const m = unquoted.match(NODE_RE);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function fullImage(src?: string | null): string | null {
  const s = clean(src);
  if (!s) {
    return null;
  }
  return s.replace(IMAGE_SIZE_RE, "");
}

export function balancedJson(text: string, start: number): any {
  const opener = text[start];
  const closer = opener === "{" ? "}" : opener === "[" ? "]" : null;
  if (!closer) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === opener) {
      depth++;
    } else if (ch === closer) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function jsonAfter(text: string, marker: string, opener: string = "{"): any {
  let start = 0;
  while (true) {
    const i = text.indexOf(marker, start);
    if (i < 0) {
      return null;
    }
    let j = i + marker.length;
    while (j < text.length && " :\n\t\r".includes(text[j])) {
      j++;
    }
    if (j < text.length && text[j] === opener) {
      const val = balancedJson(text, j);
      if (val !== null) {
        return val;
      }
    }
    start = i + marker.length;
  }
}

export function aState($: cheerio.CheerioAPI, key: string): any {
  for (const el of $('script[type="a-state"]').toArray()) {
    try {
      const metaAttr = $(el).attr("data-a-state") || "{}";
      const meta = JSON.parse(clean(metaAttr) || "{}");
      if (meta.key === key) {
        const txt = $(el).text() || "null";
        return JSON.parse(txt);
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function compact<T extends Record<string, any>>(block: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(block)) {
    if (v !== null && v !== undefined) {
      out[k] = v;
    }
  }
  return out as Partial<T>;
}
