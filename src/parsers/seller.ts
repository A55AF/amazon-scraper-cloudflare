import * as cheerio from "cheerio";
import { SiteConfig, SellerDetails, SellerRatingPeriod } from "../types";
import {
  clean,
  toInt,
  toFloat,
  ratingOf,
  percentOf,
  snake,
  absolute,
  aState
} from "./helpers";

function ratingsPeriod(raw: any): SellerRatingPeriod | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const count = raw.ratingCount !== undefined ? raw.ratingCount : null;
  const stars: Record<string, number | null> = {};
  const percents: Record<string, number | null> = {};

  for (let n = 5; n >= 1; n--) {
    stars[`${n}_star`] = raw[`star${n}Count`] !== undefined ? raw[`star${n}Count`] : null;
    percents[`${n}_star`] = raw[`star${n}`] !== undefined ? raw[`star${n}`] : null;
  }

  const positive = (raw.star5Count || 0) + (raw.star4Count || 0);
  const positivePercent = count ? toFloat((positive * 100) / count, 1) : null;

  return {
    count,
    positive_percent: positivePercent,
    stars,
    stars_percent: percents
  };
}

export function parseSellerPage(htmlText: string, site: SiteConfig): SellerDetails {
  const $ = cheerio.load(htmlText || "");
  const state = aState($, "spp-page-var-page-state") || {};
  const sellerIdRegex = htmlText.match(/seller=([A-Z0-9]+)/);
  const sellerId = state.sellerID || (sellerIdRegex ? sellerIdRegex[1] : null);

  const header = clean($("#page-section-seller-header").first().text()) || "";

  const info: Record<string, string> = {};
  let currentKey: string | null = null;

  $("#page-section-detail-seller-info .a-row").each((_, row) => {
    const $row = $(row);
    if ($row.find("h3").length || $row.attr("id") === "page-section-detail-seller-info") {
      return;
    }
    const labelSpan = $row.find("span.a-text-bold").first();
    const labelText = clean(labelSpan.text());
    if (labelText) {
      currentKey = snake(labelText.replace(/[:\s]+$/, ""));
      const fullRowText = clean($row.text()) || "";
      const val = clean(fullRowText.replace(labelText, "").replace(/^[:\s]+/, ""));
      if (currentKey && val) {
        info[currentKey] = val;
      }
    } else if (currentKey && clean($row.text())) {
      info[currentKey] = clean(`${info[currentKey] || ""} ${clean($row.text())}`.trim()) || "";
    }
  });

  let about = clean($("#page-section-about-seller").first().text());
  if (about) {
    about = clean(about.replace(/^About Seller\s*/i, ""));
    if (about) {
      about = clean(about.replace(/Have a question for .+?\?$/i, ""));
    }
  }

  const logo = $("#seller-logo img, #seller-profile-container img[src*='seller']").first();
  const logoSrc = logo.attr("src");
  const cleanLogo = logoSrc && !logoSrc.includes("loading") ? logoSrc : null;

  const storefront = $("#seller-info-storefront-link a").first();
  const storefrontHref = storefront.attr("href");

  const headerTotalMatch = header.match(/\(([\d,.]+)\s+total/);
  const ratingCount = headerTotalMatch
    ? toInt(headerTotalMatch[1])
    : toInt($("#rating-lifetime-num").first().text());

  const ratingAvg =
    ratingOf($("#effective-timeperiod-rating-lifetime-description").first().text()) ||
    ratingOf(header);

  const businessName = info.business_name || null;
  const businessAddress = info.business_address || null;
  delete info.business_name;
  delete info.business_address;

  return {
    id: sellerId,
    name: clean($("#seller-name").first().text()) || clean($("h1").first().text()),
    link: sellerId ? `${site.base}/sp?seller=${sellerId}` : null,
    storefront_link: storefrontHref
      ? absolute(site, storefrontHref)
      : sellerId
      ? `${site.base}/s?me=${sellerId}`
      : null,
    logo: cleanLogo,
    rating: {
      average: ratingAvg,
      positive_percent: percentOf(header),
      count: ratingCount
    },
    ratings: {
      lifetime: ratingsPeriod(aState($, "lifetimeRatingsData")),
      twelve_months: ratingsPeriod(aState($, "twelveMonthRatingsData")),
      three_months: ratingsPeriod(aState($, "threeMonthRatingsData")),
      one_month: ratingsPeriod(aState($, "oneMonthRatingsData"))
    },
    business: {
      name: businessName,
      address: businessAddress
    },
    about: about || null,
    info: Object.keys(info).length > 0 ? info : null,
    country: site.country,
    domain: site.host
  };
}
