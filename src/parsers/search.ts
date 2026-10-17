import * as cheerio from "cheerio";
import { SiteConfig, SearchPageResult, SearchCard, SearchFacet, SearchDepartment, Money } from "../types";
import {
  clean,
  toInt,
  ratingOf,
  money,
  amountOf,
  boughtPastMonth,
  absolute,
  productLink,
  nodeIn,
  fullImage
} from "./helpers";

const BADGE_KEYS: Array<[string, string]> = [
  ["best seller", "is_best_seller"],
  ["amazon's choice", "is_amazons_choice"],
  ["overall pick", "is_overall_pick"],
  ["limited time deal", "is_limited_time_deal"],
  ["climate pledge", "is_climate_pledge_friendly"],
  ["small business", "is_small_business"],
  ["new on amazon", "is_new_arrival"],
  ["lowest price", "is_lowest_price_in_days"]
];

function parsePriceBlock($el: cheerio.Cheerio<any>, currency: string): Money | null {
  if (!$el || !$el.length) {
    return null;
  }
  const prices: cheerio.Cheerio<any>[] = [];
  $el.find(".a-price").each((_, p) => {
    const $p = $el.find(p);
    // Ensure not inside another .a-price
    if (!$p.parents(".a-price").length) {
      prices.push($p);
    }
  });

  let current: string | null = null;
  let strike: string | null = null;

  for (const price of prices) {
    const offscreen = clean(price.find(".a-offscreen").first().text()) || clean(price.text());
    if (price.attr("data-a-strike") === "true" || (price.attr("class") || "").includes("a-text-price")) {
      strike = strike || offscreen;
    } else {
      current = current || offscreen;
    }
  }

  if (current === null && strike === null) {
    return null;
  }

  const block: Money = (current ? money(current, currency) : null) || { amount: null, currency };
  block.list_price = amountOf(strike);

  const unitText = clean($el.text());
  const match = unitText ? unitText.match(/\(\s*([^()]*?\d[^()]*?)\s*\/\s*([^()]+?)\s*\)/) : null;
  let unit: { amount: number | null; per: string | null } | null = null;
  if (match) {
    unit = { amount: amountOf(match[1]), per: clean(match[2]) };
  }
  (block as any).unit_price = unit;

  const labelMatch = unitText
    ? unitText.match(/\b(Typical|List|RRP|Was|UVP|Prix conseillé|Prezzo consigliato|Precio recomendado)\b/)
    : null;
  block.list_price_type = labelMatch && block.list_price !== null ? labelMatch[1] : null;

  return block;
}

export function parseSearchCard($card: cheerio.Cheerio<any>, site: SiteConfig): SearchCard | null {
  const asin = $card.attr("data-asin");
  if (!asin) {
    return null;
  }
  const currency = site.currency;

  const titleEl =
    $card.find("[data-cy=title-recipe] a h2").first().length
      ? $card.find("[data-cy=title-recipe] a h2").first()
      : $card.find("h2[aria-label]").first().length
      ? $card.find("h2[aria-label]").first()
      : $card.find("h2 span").first().length
      ? $card.find("h2 span").first()
      : $card.find("h2").first().length
      ? $card.find("h2").first()
      : $card.find("[data-cy=title-recipe] a").first();

  const brandEl = $card.find("[data-cy=title-recipe] > .a-row h2").first();
  const link = productLink(site, asin);
  const img = $card.find("img.s-image").first();
  const reviews = $card.find("[data-cy=reviews-block]").first();

  const ratingEl = reviews.length
    ? reviews.find("[data-cy=reviews-ratings-slot] .a-icon-alt").first().length
      ? reviews.find("[data-cy=reviews-ratings-slot] .a-icon-alt").first()
      : reviews.find("i.a-icon-star-small .a-icon-alt").first()
    : null;

  const ratingAvg = ratingEl && ratingEl.length
    ? ratingOf(clean(ratingEl.text()))
    : ratingOf(clean(reviews.find("span.a-size-small.a-color-base").first().text()));

  let ratingsCount: number | null = null;
  if (reviews.length) {
    reviews.find("[aria-label]").each((_, el) => {
      if (ratingsCount !== null) return;
      const label = clean(reviews.find(el).attr("aria-label")) || "";
      if (/^[\d,.\u00a0]+\s+(ratings?|Bewertungen|évaluations|valutazioni|calificaciones|reseñas)$/i.test(label)) {
        ratingsCount = toInt(label);
      }
    });
    if (ratingsCount === null) {
      ratingsCount = toInt(clean(reviews.find("span.s-underline-text").first().text()));
    }
  }

  const priceBlock = parsePriceBlock($card.find("[data-cy=price-recipe]").first(), currency);
  const secondary = clean($card.find("[data-cy=secondary-offer-recipe]").first().text());

  let more: { lowest_price: number | null; offers_count: number | null; text: string | null } | null = null;
  if (secondary) {
    const secCountMatch = secondary.match(/\((\d[\d,]*)/);
    more = {
      lowest_price: amountOf(secondary),
      offers_count: secCountMatch ? toInt(secCountMatch[1]) : null,
      text: secondary
    };
  }

  const badgeTexts: string[] = [];
  $card.find(".a-badge-text, [data-cy=s-pc-faceout-badge]").each((_, b) => {
    const t = clean($card.find(b).text());
    if (t) badgeTexts.push(t);
  });
  const badgeText = badgeTexts.join(" ");
  const faceoutText = clean($card.text()) || "";
  const low = `${badgeText} ${faceoutText.slice(0, 600)}`.toLowerCase();

  const badges: Record<string, boolean> = {};
  for (const [label, key] of BADGE_KEYS) {
    badges[key] = low.includes(label);
  }
  badges.is_prime = $card.find(".a-icon-prime, .s-prime").length > 0;

  const delivery = clean($card.find("[data-cy=delivery-recipe]").first().text());
  const coupon = clean($card.find(".s-coupon-unclipped, [data-cy=coupon-recipe]").first().text());

  const optionsMatch = faceoutText.match(/Options:\s*([^.\n]+?)(?:\s+See options|\s+\d|$)/);
  const bought = boughtPastMonth(clean(reviews.text()));
  const boughtMatch = clean(reviews.text())?.match(/[\d.,]+[KkMm]?\+?\s*bought in past month/);

  const isSponsored =
    ($card.attr("class") || "").includes("AdHolder") ||
    $card.find(".AdHolder, .puis-sponsored-label-text, .s-sponsored-label-text").length > 0 ||
    $card.parents(".AdHolder").length > 0;

  const titleText = clean(titleEl.text());
  const brandText = brandEl.length && brandEl.get(0) !== titleEl.get(0) ? clean(brandEl.text()) : null;

  return {
    asin,
    title: titleText,
    brand: brandText,
    link,
    image: fullImage(img.attr("src")),
    thumbnail: img.attr("src") || null,
    is_sponsored: isSponsored,
    price: priceBlock,
    rating:
      ratingAvg !== null || ratingsCount !== null
        ? { average: ratingAvg, count: ratingsCount }
        : null,
    bought_past_month: bought,
    bought_past_month_text: boughtMatch ? boughtMatch[0] : null,
    badges,
    delivery: delivery || null,
    coupon: coupon || null,
    variations_text: optionsMatch ? clean(optionsMatch[1]) : null,
    has_variations: Boolean(optionsMatch) || faceoutText.includes("See options"),
    more_buying_choices: more,
    position: toInt($card.attr("data-index"))
  };
}

function parseFacet($: cheerio.CheerioAPI, $ul: cheerio.Cheerio<any>, site: SiteConfig): SearchFacet {
  const fid = ($ul.attr("id") || "").replace("filter-", "");
  const titleDiv = $ul.prev("div");
  const name = titleDiv.length ? clean(titleDiv.text()) : null;
  const options: any[] = [];

  $ul.find("li").each((_, li) => {
    const $li = $(li);
    const a = $li.find("a[href]").first();
    const label = clean($li.find("span.a-size-base").first().text()) || clean($li.text());
    if (!label) {
      return;
    }
    const liId = $li.attr("id") || "";
    let value = liId.includes("/") ? liId.split("/")[1] : null;
    const href = a.length ? a.attr("href") : null;
    if (value === null && href) {
      try {
        const u = new URL(href, site.base);
        const rh = u.searchParams.get("rh") || "";
        const lastPart = rh.split(",").pop();
        if (lastPart && lastPart.includes(":")) {
          value = lastPart.split(":")[1];
        }
      } catch {
        // ignore
      }
    }
    const isSelected =
      !a.length ||
      a.attr("aria-current") === "true" ||
      (a.attr("class") || "").includes("a-text-bold");

    options.push({
      name: label,
      value: value || null,
      link: href ? absolute(site, href) : null,
      is_selected: isSelected
    });
  });

  return { id: fid || null, name, options };
}

export function parseSearchPage(htmlText: string, site: SiteConfig): SearchPageResult {
  const $ = cheerio.load(htmlText || "");
  const results: SearchCard[] = [];

  $('div[data-component-type="s-search-result"]').each((_, card) => {
    const parsed = parseSearchCard($(card), site);
    if (parsed) {
      results.push(parsed);
    }
  });

  const infoEl = $(
    '[data-component-type="s-result-info-bar"] span.a-size-base, [data-component-type="s-result-info-bar"]'
  ).first();
  const info = clean(infoEl.text()) || "";

  const totalMatch =
    info.match(/of\s+(?:over\s+|more than\s+)?([\d,. ]+)\s+results/) ||
    info.match(/([\d,. ]+)\s+results/);
  const total = totalMatch ? toInt(totalMatch[1]) : null;
  const isOver = /\b(over|more than)\b/i.test(info);

  const pages: number[] = [];
  $(".s-pagination-item").each((_, p) => {
    const t = clean($(p).text());
    if (t && /^\d+$/.test(t)) {
      pages.push(parseInt(t, 10));
    }
  });
  const totalPages = pages.length > 0 ? Math.max(...pages) : results.length > 0 ? 1 : 0;
  const current = toInt($(".s-pagination-item.s-pagination-selected").first().text()) || 1;

  const refinements: SearchFacet[] = [];
  $("#s-refinements ul[id^=filter-]").each((_, ul) => {
    const facet = parseFacet($, $(ul), site);
    if (facet.options.length > 0 && facet.id !== "departments") {
      refinements.push(facet);
    }
  });

  const departments: SearchDepartment[] = [];
  $("#departments li, #filter-departments li").each((_, li) => {
    const $li = $(li);
    const a = $li.find("a[href]").first();
    const name = clean($li.text());
    if (!name) return;
    const href = a.length ? a.attr("href") : null;
    const isSelected = !a.length || (a.attr("class") || "").includes("a-text-bold");
    departments.push({
      name,
      node_id: href ? nodeIn(href) : null,
      link: href ? absolute(site, href) : null,
      is_selected: isSelected
    });
  });

  const aliases: Array<{ id: string; name: string }> = [];
  $("#searchDropdownBox option").each((_, o) => {
    const val = $(o).attr("value") || "";
    if (val) {
      aliases.push({
        id: val.replace("search-alias=", ""),
        name: clean($(o).text()) || ""
      });
    }
  });

  return {
    results,
    total_count: total,
    is_total_approximate: isOver,
    results_text: info ? clean(info.split("Sort by")[0]) : null,
    departments,
    refinements,
    search_aliases: aliases,
    current_page: current,
    total_pages: totalPages
  };
}
