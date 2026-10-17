import * as cheerio from "cheerio";
import { SiteConfig, OffersResult, OfferItem } from "../types";
import {
  clean,
  toInt,
  ratingOf,
  percentOf,
  money,
  amountOf,
  absolute
} from "./helpers";

export function parseOffer($block: cheerio.Cheerio<any>, site: SiteConfig, isPinned: boolean): OfferItem {
  const currency = site.currency;
  const priceEl = $block.find("#aod-offer-price").first().length ? $block.find("#aod-offer-price").first() : $block;
  const currentText =
    clean(priceEl.find(".a-price:not([data-a-strike]) .a-offscreen").first().text()) ||
    clean(priceEl.find(".aok-offscreen").first().text());

  const price = currentText ? money(currentText, currency) : null;
  const strikeText = clean($block.find("[data-a-strike=true] .a-offscreen, .basisPrice .a-offscreen").first().text());

  if (price !== null) {
    price.list_price = amountOf(strikeText);
    const savings = clean($block.find(".savingsPercentage, .a-color-price").first().text());
    price.savings_percent = savings && savings.includes("%") ? Math.abs(percentOf(savings)!) : null;
  }

  const soldByEl = $block.find("#aod-offer-soldBy").first();
  const sellerA = soldByEl.find("a").first();
  const sellerHref = sellerA.attr("href");
  const rawSoldByText = clean(soldByEl.text()) || "";
  const sellerName =
    clean(sellerA.text()) ||
    clean(rawSoldByText.replace(/^(Sold by|Verkauf durch|Vendu par)\s*/i, ""));

  let sellerId: string | null = null;
  if (sellerHref) {
    try {
      const u = new URL(sellerHref, site.base);
      sellerId = u.searchParams.get("seller");
    } catch {
      // ignore
    }
  }

  const shipsFromRaw = clean($block.find("#aod-offer-shipsFrom").first().text()) || "";
  const shipsFrom = clean(shipsFromRaw.replace(/^(Ships from|Dispatches from|Versand durch|Expédié par)\s*/i, "")) || null;

  const condition = clean($block.find("#aod-offer-heading").first().text()) || (isPinned ? "New" : null);

  let note = clean($block.find("#aod-condition-container").first().text());
  if (note) {
    note = clean(note.replace(/^(Condition|Zustand|État)\s*/i, ""));
  }

  const delivery: string[] = [];
  $block.find("[data-csa-c-delivery-price]").each((_, el) => {
    const t = clean(cheerio.load(el).text());
    if (t) delivery.push(t);
  });

  const qty: number[] = [];
  $block.find("select[id^=aod-qty] option, #aod-qty-option option").each((_, opt) => {
    const val = toInt(cheerio.load(opt).text());
    if (val !== null) qty.push(val);
  });

  const ratingText = clean($block.find("#aod-offer-seller-rating").first().text()) || "";
  const countMatch = ratingText.match(/\((\d[\d,]*)/);

  return {
    condition,
    condition_note: note || null,
    price,
    seller:
      sellerName || sellerId
        ? {
            name: sellerName || null,
            id: sellerId,
            link: sellerId ? `${site.base}/sp?seller=${sellerId}` : absolute(site, sellerHref),
            rating: ratingOf(ratingText),
            positive_percent: percentOf(ratingText),
            ratings_count: countMatch ? toInt(countMatch[1]) : null
          }
        : null,
    ships_from: shipsFrom,
    is_fulfilled_by_amazon: (shipsFrom || "").toLowerCase().startsWith("amazon"),
    is_sold_by_amazon: (sellerName || "").toLowerCase().startsWith("amazon"),
    is_prime: $block.find(".a-icon-prime").length > 0,
    delivery: delivery.length > 0
      ? {
          text: delivery[0] || null,
          fastest_text: delivery.length > 1 ? delivery[1] : null
        }
      : null,
    max_quantity: qty.length > 0 ? Math.max(...qty) : null,
    promotion: clean($block.find("[id^=aod-offer-promotion]").first().text()) || null,
    is_pinned: isPinned
  };
}

export function parseOffersPage(htmlText: string, site: SiteConfig): OffersResult {
  const $ = cheerio.load(htmlText || "");
  const pinned = $("#aod-pinned-offer").first();
  const offers: OfferItem[] = [];

  if (pinned.length && (pinned.find(".a-price").length || pinned.find(".aok-offscreen").length)) {
    offers.push(parseOffer(pinned, site, true));
  }

  $("#aod-offer").each((_, block) => {
    offers.push(parseOffer($(block), site, false));
  });

  const totalAttr = $("#aod-total-offer-count").first().attr("value");
  const total = toInt(totalAttr);

  const asinVal = $("#aod-asin-block-asin").first().attr("value");
  const asinRegexMatch = htmlText.match(/data-asin="([A-Z0-9]{10})"/);
  const asin = asinVal || (asinRegexMatch ? asinRegexMatch[1] : "");

  const hasReviews = $("#aod-asin-reviews").length > 0;
  const ratingAvg = ratingOf($("#aod-asin-reviews-star .a-icon-alt").first().text());
  const ratingCnt = toInt($("#aod-asin-reviews-count-title").first().text());

  const nonPinnedCount = offers.filter(o => !o.is_pinned).length;
  const hasMore = !htmlText.includes("aod-end-of-results") && total !== null && total > nonPinnedCount;

  return {
    asin,
    title: clean($("#aod-asin-title-text").first().text()),
    rating: hasReviews ? { average: ratingAvg, count: ratingCnt } : null,
    offers,
    other_offers_count: total,
    has_more: hasMore,
    country: site.country,
    domain: site.host
  };
}
