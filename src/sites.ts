import { SiteConfig } from "./types";

export const SITES: Record<string, Omit<SiteConfig, "country" | "host" | "base" | "data_host" | "completion_host">> = {
  US: { domain: "amazon.com", marketplace_id: "ATVPDKIKX0DER", language: "en_US", currency: "USD",
        fingerprint: "chrome", postal_code: "10001", exit_country: null },
  CA: { domain: "amazon.ca", marketplace_id: "A2EUQ1WTGCTBG2", language: "en_CA", currency: "CAD",
        fingerprint: "chrome", postal_code: "M5V 3L9", exit_country: null },
  MX: { domain: "amazon.com.mx", marketplace_id: "A1AM78C64UM0Y8", language: "es_MX", currency: "MXN",
        fingerprint: "safari17_0", postal_code: "01000", exit_country: null },
  BR: { domain: "amazon.com.br", marketplace_id: "A2Q3Y263D00KWC", language: "pt_BR", currency: "BRL",
        fingerprint: "safari17_0", postal_code: "01310-100", exit_country: null },
  GB: { domain: "amazon.co.uk", marketplace_id: "A1F83G8C2ARO7P", language: "en_GB", currency: "GBP",
        fingerprint: "safari17_0", postal_code: "SW1A 1AA", exit_country: null },
  IE: { domain: "amazon.ie", marketplace_id: "A28R8C7NBKEWEA", language: "en_IE", currency: "EUR",
        fingerprint: "safari17_0", postal_code: "D02 X285", exit_country: null },
  DE: { domain: "amazon.de", marketplace_id: "A1PA6795UKMFR9", language: "de_DE", currency: "EUR",
        fingerprint: "safari17_0", postal_code: "10115", exit_country: null },
  FR: { domain: "amazon.fr", marketplace_id: "A13V1IB3VIYZZH", language: "fr_FR", currency: "EUR",
        fingerprint: "safari17_0", postal_code: "75001", exit_country: null },
  IT: { domain: "amazon.it", marketplace_id: "APJ6JRA9NG5V4", language: "it_IT", currency: "EUR",
        fingerprint: "safari17_0", postal_code: "00100", exit_country: null },
  ES: { domain: "amazon.es", marketplace_id: "A1RKKUPIHCS9HS", language: "es_ES", currency: "EUR",
        fingerprint: "safari17_0", postal_code: "28001", exit_country: null },
  NL: { domain: "amazon.nl", marketplace_id: "A1805IZSGTT6HS", language: "nl_NL", currency: "EUR",
        fingerprint: "safari17_0", postal_code: "1012 AB", exit_country: null },
  BE: { domain: "amazon.com.be", marketplace_id: "AMEN7PMS3EDWL", language: "fr_BE", currency: "EUR",
        fingerprint: "safari17_0", postal_code: "1000", exit_country: null },
  SE: { domain: "amazon.se", marketplace_id: "A2NODRKZP88ZB9", language: "sv_SE", currency: "SEK",
        fingerprint: "safari17_0", postal_code: "111 20", exit_country: null },
  PL: { domain: "amazon.pl", marketplace_id: "A1C3SOZRARQ6R3", language: "pl_PL", currency: "PLN",
        fingerprint: "safari17_0", postal_code: "00-001", exit_country: null },
  TR: { domain: "amazon.com.tr", marketplace_id: "A33AVAJ2PDY3EV", language: "tr_TR", currency: "TRY",
        fingerprint: "safari17_0", postal_code: "34000", exit_country: null },
  AE: { domain: "amazon.ae", marketplace_id: "A2VIGQ35RCS4UG", language: "en_AE", currency: "AED",
        fingerprint: "safari17_0", postal_code: null, exit_country: null },
  SA: { domain: "amazon.sa", marketplace_id: "A17E79C6D8DWNP", language: "en_AE", currency: "SAR",
        fingerprint: "safari17_0", postal_code: null, exit_country: null },
  EG: { domain: "amazon.eg", marketplace_id: "ARBP9OOSHTCHU", language: "en_AE", currency: "EGP",
        fingerprint: "safari17_0", postal_code: null, exit_country: null },
  IN: { domain: "amazon.in", marketplace_id: "A21TJRUUN4KGV", language: "en_IN", currency: "INR",
        fingerprint: "safari17_0", postal_code: "110001", exit_country: null },
  JP: { domain: "amazon.co.jp", marketplace_id: "A1VC38T7YXB528", language: "ja_JP", currency: "JPY",
        fingerprint: "safari17_0", postal_code: "100-0001", exit_country: "jp" },
  SG: { domain: "amazon.sg", marketplace_id: "A19VAU5U5O7RUS", language: "en_SG", currency: "SGD",
        fingerprint: "safari17_0", postal_code: "018956", exit_country: null },
  AU: { domain: "amazon.com.au", marketplace_id: "A39IBJ37TRP1C6", language: "en_AU", currency: "AUD",
        fingerprint: "safari17_0", postal_code: "2000", exit_country: "au" },
  ZA: { domain: "amazon.co.za", marketplace_id: "AE08WJ6YKNBMC", language: "en_ZA", currency: "ZAR",
        fingerprint: "safari17_0", postal_code: "2000", exit_country: null },
};

export const DEFAULT_COUNTRY = "US";
export const COUNTRIES = Object.keys(SITES) as ReadonlyArray<string>;

const DOMAIN_TO_COUNTRY: Record<string, string> = {};
for (const [code, row] of Object.entries(SITES)) {
  DOMAIN_TO_COUNTRY[row.domain] = code;
}

export function site(country?: string | null): SiteConfig {
  let code = (country || DEFAULT_COUNTRY).toUpperCase().trim();
  if (code === "UK") {
    code = "GB";
  }
  const row = SITES[code];
  if (!row) {
    throw new Error(`country must be one of: ${COUNTRIES.join(", ")}`);
  }
  return {
    ...row,
    country: code,
    host: `www.${row.domain}`,
    base: `https://www.${row.domain}`,
    data_host: `data.${row.domain}`,
    completion_host: `completion.${row.domain}`,
  };
}

export function countryForHost(host?: string | null): string | null {
  const cleanHost = (host || "").toLowerCase().split(":")[0];
  const labels = cleanHost.split(".");
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    const code = DOMAIN_TO_COUNTRY[candidate];
    if (code) {
      return code;
    }
  }
  return null;
}
