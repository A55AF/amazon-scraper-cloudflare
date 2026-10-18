import { SiteConfig, AmazonNotFoundError, AmazonBlockedError, AmazonBadRequestError, AmazonUpstreamError } from "./types";
import { site as getSite } from "./sites";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export const PAGE_HEADERS: Record<string, string> = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "user-agent": DEFAULT_USER_AGENT,
};

export const AJAX_HEADERS: Record<string, string> = {
  "accept": "text/html,*/*",
  "accept-language": "en-US,en;q=0.9",
  "x-requested-with": "XMLHttpRequest",
  "user-agent": DEFAULT_USER_AGENT,
};

const POW_RE = /var i = (\d+); var j = i \+ Number\("(\d+)" \+ "(\d+)"\)/;
const POW_TOKEN_RE = /"bm-verify": "([^"]+)"/;
const GLOW_TOKEN_RE = /anti-csrftoken-a2z(?:&quot;|"):(?:&quot;|")([^&"]+)/;
const MODAL_TOKEN_RE = /CSRF_TOKEN\s*:\s*"([^"]+)"/;

export interface FetchOptions {
  proxy?: string | null;
  language?: string | null;
  postal_code?: string | null;
  referer?: string | null;
}

export class AmazonSession {
  public site: SiteConfig;
  public cookies: Map<string, string> = new Map();
  public warmed: boolean = false;
  public located: string | null = null;
  public glowToken: string | null = null;
  public proxy: string | null = null;
  public language: string;

  constructor(site: SiteConfig, proxy?: string | null, language?: string | null) {
    this.site = site;
    this.proxy = proxy || null;
    this.language = language || site.language;
    this.cookies.set("i18n-prefs", site.currency);
    this.cookies.set("lc-main", this.language);
  }

  public getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  public storeCookies(responseHeaders: Headers) {
    let cookieStrings: string[] = [];
    if (typeof (responseHeaders as any).getSetCookie === "function") {
      cookieStrings = (responseHeaders as any).getSetCookie();
    } else {
      const rawSetCookies = responseHeaders.get("set-cookie");
      if (!rawSetCookies) return;
      // Split on commas that are not part of an HTTP date (e.g. Expires=Wed, 21-Oct-2026)
      cookieStrings = rawSetCookies.split(/,(?!\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b)/i);
    }

    for (const cookieStr of cookieStrings) {
      const firstPart = cookieStr.split(";")[0].trim();
      const eqIdx = firstPart.indexOf("=");
      if (eqIdx > 0) {
        const name = firstPart.slice(0, eqIdx).trim();
        const value = firstPart.slice(eqIdx + 1).trim();
        if (name && !name.toLowerCase().includes("expires") && !name.toLowerCase().includes("domain") && !name.toLowerCase().includes("path")) {
          this.cookies.set(name, value);
        }
      }
    }
  }

  public async fetch(
    url: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const headers = new Headers(init.headers || {});
    if (!headers.has("cookie")) {
      const cookieHeader = this.getCookieHeader();
      if (cookieHeader) {
        headers.set("cookie", cookieHeader);
      }
    }

    let fetchUrl = url;
    if (this.proxy) {
      if (this.proxy.includes("{url}")) {
        fetchUrl = this.proxy.replace("{url}", encodeURIComponent(url));
      } else if (this.proxy.includes("scraperapi.com") || this.proxy.includes("api.")) {
        const u = new URL(this.proxy);
        u.searchParams.set("url", url);
        fetchUrl = u.toString();
      }
    }

    const response = await fetch(fetchUrl, {
      ...init,
      headers
    });

    this.storeCookies(response.headers);
    return response;
  }
}

function isCaptcha(text: string): boolean {
  return text.includes("validateCaptcha") || text.includes("Enter the characters you see below");
}

function isDogs(text: string): boolean {
  return text.includes("Sorry! Something went wrong") && text.length < 20000;
}

function isPow(text: string): boolean {
  return text.includes("bm-verify") && text.includes("_sec/verify") && text.length < 20000;
}

function isSignin(url: string): boolean {
  return (url || "").includes("/ap/signin");
}

function checkBlockedReason(status: number, text: string): string | null {
  if (status === 503 && (isDogs(text) || text.length < 3000)) {
    return "503 dogs page";
  }
  if (isCaptcha(text)) {
    return "captcha";
  }
  if (status === 202 && text.length < 2000) {
    return "202 bot check";
  }
  return null;
}

export class AmazonFetcher {
  private sessions: Map<string, AmazonSession> = new Map();
  private defaultProxy?: string | null;

  constructor(defaultProxy?: string | null) {
    this.defaultProxy = defaultProxy || null;
  }

  public getSession(country: string, language?: string | null, proxy?: string | null): AmazonSession {
    const s = getSite(country);
    const lang = language || s.language;
    const key = `${s.country}:${lang}`;
    let session = this.sessions.get(key);
    if (!session) {
      session = new AmazonSession(s, proxy || this.defaultProxy, lang);
      this.sessions.set(key, session);
    }
    return session;
  }

  public dropSession(country: string, language?: string | null): void {
    const s = getSite(country);
    const lang = language || s.language;
    const key = `${s.country}:${lang}`;
    this.sessions.delete(key);
  }

  public async warm(session: AmazonSession): Promise<void> {
    if (session.warmed) {
      return;
    }
    const resp = await session.fetch(`${session.site.base}/`, {
      headers: { ...PAGE_HEADERS, referer: `${session.site.base}/` }
    });
    const text = await resp.text();
    const reason = checkBlockedReason(resp.status, text);
    if (reason) {
      throw new AmazonBlockedError(`warm-up on ${session.site.host}: ${reason}`);
    }
    session.warmed = true;
    const match = text.match(GLOW_TOKEN_RE);
    if (match) {
      session.glowToken = match[1];
    }
  }

  public async solvePow(session: AmazonSession, text: string): Promise<boolean> {
    const match = text.match(POW_RE);
    const token = text.match(POW_TOKEN_RE);
    if (!match || !token) {
      return false;
    }
    const powVal = parseInt(match[1], 10) + parseInt(match[2] + match[3], 10);
    const resp = await session.fetch(`${session.site.base}/_sec/verify?provider=interstitial`, {
      method: "POST",
      headers: {
        ...PAGE_HEADERS,
        "content-type": "application/json",
        "origin": session.site.base
      },
      body: JSON.stringify({
        "bm-verify": token[1],
        "pow": powVal
      })
    });
    return resp.status === 200;
  }

  public async setLocation(session: AmazonSession, postalCode?: string | null): Promise<boolean> {
    const code = postalCode || session.site.postal_code;
    if (!code || session.located === code || !session.glowToken) {
      return false;
    }
    const base = session.site.base;
    try {
      const headers = {
        ...AJAX_HEADERS,
        "anti-csrftoken-a2z": session.glowToken,
        "referer": `${base}/`
      };
      const modalResp = await session.fetch(
        `${base}/portal-migration/hz/glow/get-rendered-address-selections?deviceType=desktop&pageType=Detail&storeContext=generic&actionSource=desktop-modal`,
        { headers }
      );
      const modalText = await modalResp.text();
      const match = modalText.match(MODAL_TOKEN_RE);
      const token = match ? match[1] : session.glowToken;

      const changeResp = await session.fetch(
        `${base}/portal-migration/hz/glow/address-change?actionSource=glow`,
        {
          method: "POST",
          headers: {
            ...headers,
            "anti-csrftoken-a2z": token,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            locationType: "LOCATION_INPUT",
            zipCode: code,
            deviceType: "web",
            storeContext: "generic",
            pageType: "Detail",
            actionSource: "glow"
          })
        }
      );
      const body = (await changeResp.json()) as any;
      const ok = Boolean(body?.isAddressUpdated || body?.successful);
      session.located = code;
      return ok;
    } catch {
      session.located = code;
      return false;
    }
  }

  public async request(
    country: string,
    method: string,
    path: string,
    options: FetchOptions & {
      params?: Record<string, string>;
      body?: string;
      headers?: Record<string, string>;
      locate?: boolean;
    } = {}
  ): Promise<string> {
    const session = this.getSession(country, options.language, options.proxy);
    const site = session.site;
    let url = path.startsWith("http") ? path : `${site.base}${path}`;

    if (options.params && Object.keys(options.params).length > 0) {
      const u = new URL(url);
      for (const [k, v] of Object.entries(options.params)) {
        if (v !== undefined && v !== null && v !== "") {
          u.searchParams.set(k, v);
        }
      }
      url = u.toString();
    }

    await this.warm(session);

    const reqHeaders: Record<string, string> = {
      ...PAGE_HEADERS,
      "referer": options.referer || `${site.base}/s?k=amazon`,
      ...(options.headers || {})
    };

    let resp = await session.fetch(url, {
      method,
      headers: reqHeaders,
      body: options.body
    });

    let text = await resp.text();

    if (isPow(text)) {
      const solved = await this.solvePow(session, text);
      if (solved) {
        resp = await session.fetch(url, {
          method,
          headers: reqHeaders,
          body: options.body
        });
        text = await resp.text();
      }
    }

    const reason = checkBlockedReason(resp.status, text);
    if (reason) {
      throw new AmazonBlockedError(`${url}: ${reason}`);
    }
    if (isSignin(resp.url)) {
      throw new AmazonBlockedError(`${url}: Amazon requires a signed-in user for this page`);
    }

    if (resp.status === 404) {
      throw new AmazonNotFoundError(`${url}: not found`);
    }
    if (resp.status === 400) {
      throw new AmazonBadRequestError(`${url}: HTTP 400`);
    }
    if (resp.status >= 500) {
      throw new AmazonUpstreamError(`HTTP ${resp.status} on ${url}`);
    }

    if (options.locate !== false && resp.status === 200) {
      const wanted = options.postal_code || site.postal_code;
      if (wanted && session.located !== wanted) {
        const tokenMatch = text.match(GLOW_TOKEN_RE);
        if (tokenMatch) {
          session.glowToken = tokenMatch[1];
        }
        const updated = await this.setLocation(session, wanted);
        if (updated) {
          // Re-fetch once with local delivery address
          resp = await session.fetch(url, { method, headers: reqHeaders, body: options.body });
          text = await resp.text();
        }
      }
    }

    return text;
  }

  public async getPage(country: string, path: string, options: FetchOptions & { params?: Record<string, string> } = {}): Promise<string> {
    return this.request(country, "GET", path, options);
  }

  public async getAjax(country: string, path: string, options: FetchOptions & { params?: Record<string, string> } = {}): Promise<string> {
    return this.request(country, "GET", path, {
      ...options,
      headers: AJAX_HEADERS
    });
  }
}

export const defaultFetcher = new AmazonFetcher();
