import * as cheerio from "cheerio";
import { SiteConfig, ProductDetails, Rating, Buybox, Delivery, Money } from "../types";
import {
  clean,
  parseAmount,
  toInt,
  toFloat,
  ratingOf,
  percentOf,
  money,
  amountOf,
  isoDate,
  boughtPastMonth,
  snake,
  absolute,
  productLink,
  nodeIn,
  fullImage,
  jsonAfter,
  compact
} from "./helpers";

export function parseProductPage(htmlText: string, site: SiteConfig): ProductDetails {
  const $ = cheerio.load(htmlText || "");
  const currency = site.currency;

  const currentAsinMatch =
    htmlText.match(/"currentAsin"\s*:\s*"([A-Z0-9]{10})"/) ||
    htmlText.match(/name="ASIN"\s+value="([A-Z0-9]{10})"/) ||
    htmlText.match(/data-asin="([A-Z0-9]{10})"/);
  const asin = currentAsinMatch ? currentAsinMatch[1] : "";

  const parentAsinMatch =
    htmlText.match(/"parentAsin"\s*:\s*"([A-Z0-9]{10})"/) ||
    htmlText.match(/id="parentAsin"\s+value="([A-Z0-9]{10})"/) ||
    htmlText.match(/name="parentAsin"\s+value="([A-Z0-9]{10})"/);
  const parentAsin = parentAsinMatch ? parentAsinMatch[1] : null;

  // Details rows
  const detailsRaw: Record<string, string> = {};
  $(
    "#prodDetails tr, #productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, " +
    "#productDetails_detailBullets_sections1 tr, #productDetails_db_sections tr"
  ).each((_, tr) => {
    const th = $(tr).find("th").first();
    const td = $(tr).find("td").first();
    if (th.length && td.length) {
      const label = clean(th.text()?.replace(/:$/, ""));
      const val = clean(td.text());
      if (label && val && !detailsRaw[label]) {
        detailsRaw[label] = val;
      }
    }
  });

  $("#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li").each((_, li) => {
    const bold = $(li).find("span.a-text-bold").first();
    if (bold.length) {
      const boldText = clean(bold.text()) || "";
      const fullText = clean($(li).text()) || "";
      const val = clean(fullText.replace(boldText, "").replace(/^[:\s]+/, ""));
      const label = clean(boldText.replace(/:$/, ""));
      if (label && val && !detailsRaw[label]) {
        detailsRaw[label] = val;
      }
    }
  });

  $("#productFactsDesktopExpander .a-fixed-left-grid").each((_, grid) => {
    const cols = $(grid).find(".a-fixed-left-grid-col");
    if (cols.length >= 2) {
      const label = clean($(cols[0]).text()?.replace(/:$/, ""));
      const val = clean($(cols[1]).text());
      if (label && val && !detailsRaw[label]) {
        detailsRaw[label] = val;
      }
    }
  });

  const details: Record<string, string> = {};
  for (const [label, val] of Object.entries(detailsRaw)) {
    const key = snake(label);
    if (!key || ["best_sellers_rank", "customer_reviews", "customer_reviews_rank", "asin"].includes(key)) {
      continue;
    }
    details[key] = val;
  }

  const identifiers: Record<string, string> = {};
  const idKeys = [
    "upc", "ean", "isbn_10", "isbn_13", "gtin", "global_trade_identification_number",
    "model_number", "item_model_number", "part_number", "manufacturer_part_number"
  ];
  for (const k of idKeys) {
    if (details[k]) {
      const mapped = k
        .replace("global_trade_identification_number", "gtin")
        .replace("item_model_number", "model_number")
        .replace("manufacturer_part_number", "part_number");
      identifiers[mapped] = details[k];
    }
  }

  // Brand and Authors
  const { brand: rawBrand, authors } = parseByline($, site);
  const overview: Record<string, string> = {};
  $("#productOverview_feature_div tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length >= 2) {
      const k = snake(clean($(cells[0]).text()));
      const v = clean($(cells[1]).text());
      if (k && v) {
        overview[k] = v;
      }
    }
  });

  const brandName = overview.brand || details.brand_name || details.brand || null;
  let brand = rawBrand;
  if (!brand && brandName) {
    brand = { name: brandName, byline: brandName, link: null, store_link: null };
  } else if (brand) {
    brand = {
      name: brandName || brand.name,
      byline: brand.name,
      link: brand.link,
      store_link: brand.store_link
    };
  }

  // Bullets
  let bullets: string[] = [];
  $("#feature-bullets li span.a-list-item").each((_, el) => {
    const t = clean($(el).text());
    if (t) bullets.push(t);
  });
  if (bullets.length === 0) {
    $("#productFactsDesktopExpander ul li, #pqv-feature-bullets li").each((_, el) => {
      const t = clean($(el).text());
      if (t && !bullets.includes(t)) {
        bullets.push(t);
      }
    });
  }

  // Rating & Count
  const popover = $("#acrPopover").first();
  const ratingText = popover.attr("title") || popover.text();
  const ratingVal = ratingOf(ratingText);
  const countText = $("#acrCustomerReviewText").first().text() || $("[data-hook=total-review-count]").first().text();
  const ratingsCount = toInt(countText);

  // Reviews
  const reviews: any[] = [];
  $("[data-hook=review]").each((_, card) => {
    const r = parseReview($(card), site);
    if (r && r.id) {
      reviews.push(r);
    }
  });

  // Badges (strip <script> and <style> tags so JSON state never leaks into badge text)
  const badgeEls = $("#zeitgeistBadge_feature_div, #acBadge_feature_div, .badge-wrapper");
  const badgeTexts: string[] = [];
  badgeEls.each((_, el) => {
    const $clone = $(el).clone();
    $clone.find("script, style").remove();
    const t = clean($clone.text());
    if (t && !t.startsWith("{") && !t.endsWith("}")) {
      badgeTexts.push(t);
    }
  });
  const badgeCombined = badgeTexts.join(" ");
  const badgeLow = badgeCombined.toLowerCase();

  let dealBadge = clean($("#dealBadgeSupportingText").first().text()) || clean($("#dealBadge_feature_div span").first().text());
  if (dealBadge && dealBadge.includes("NO_OF_")) {
    dealBadge = clean(dealBadge.split(/\s+NO_OF_|\s+Limited time deal\s+NO_OF/)[0]);
  }

  const coupon = clean($("#promoPriceBlockMessage_feature_div label, #promoPriceBlockMessage_feature_div .a-color-success").first().text());

  const breadcrumbs: Array<{ name: string; link: string | null; node_id: string | null }> = [];
  $("#wayfinding-breadcrumbs_feature_div li a").each((_, a) => {
    const name = clean($(a).text());
    const href = $(a).attr("href");
    if (name) {
      breadcrumbs.push({
        name,
        link: absolute(site, href),
        node_id: nodeIn(href)
      });
    }
  });

  const videos = parseVideos(htmlText);
  const videoCountText = clean($("#videoCount").first().text());
  const videosCount = toInt(videoCountText) || (videos.length || null);

  const priceBlock = parsePrice($, currency);

  return {
    asin,
    parent_asin: parentAsin,
    title: clean($("#productTitle").first().text()) || clean($("#title").first().text()),
    link: productLink(site, asin),
    brand,
    authors: authors.length > 0 ? authors : null,
    price: priceBlock,
    deal_badge: dealBadge || null,
    coupon: coupon || null,
    availability: parseAvailability($),
    buybox: parseBuybox($, site),
    delivery: parseDelivery($),
    is_prime: $(
      "#desktop_buybox .a-icon-prime, #buybox .a-icon-prime, #deliveryBlockMessage .a-icon-prime, " +
      "#mir-layout-DELIVERY_BLOCK .a-icon-prime, #prime-badge, #primeExclusivePricingMessage"
    ).length > 0,
    rating:
      ratingVal !== null || ratingsCount !== null
        ? { average: ratingVal, count: ratingsCount, histogram: parseHistogram($) }
        : null,
    bought_past_month: boughtPastMonth($("#social-proofing-faceout-title-tk_bought").first().text()),
    badges: {
      is_best_seller: badgeLow.includes("best seller") || badgeLow.includes("الأكثر مبيعاً"),
      is_amazons_choice: badgeLow.includes("amazon's choice") || badgeLow.includes("اختيار أمازون") || htmlText.includes('"acAsin"'),
      is_amazon_choice: badgeLow.includes("amazon's choice") || badgeLow.includes("اختيار أمازون") || htmlText.includes('"acAsin"'),
      best_seller_text: clean(badgeCombined),
      is_climate_pledge_friendly: $("#climatePledgeFriendly, #climatePledgeFriendlyBadge").length > 0
    },
    categories: breadcrumbs,
    best_sellers_rank: parseBestSellersRank($, site),
    bullets,
    overview: Object.keys(overview).length > 0 ? overview : null,
    description: clean($("#productDescription").first().text()) || clean($("#bookDescription_feature_div").first().text()),
    aplus_description: (() => {
      const t = clean($("#aplus_feature_div, #aplus").first().text());
      return t && t.length > 60 ? t : null;
    })(),
    details: Object.keys(details).length > 0 ? details : null,
    identifiers: Object.keys(identifiers).length > 0 ? identifiers : null,
    images: parseImages(htmlText, $, asin),
    videos,
    videos_count: videosCount,
    variations: parseVariations(htmlText, site),
    customers_say: parseCustomersSay(htmlText),
    top_reviews: reviews,
    has_inline_reviews: reviews.length > 0,
    important_information: clean($("#important-information").first().text()),
    warranty: clean($("#warrantyInfo").first().text()),
    country: site.country,
    domain: site.host
  };
}

export function reviewTreatment(htmlText: string): string | null {
  const match = htmlText.match(/cr-weblab-state&quot;\}">\{"[0-9a-f]+":"(\w+)"\}/);
  return match ? match[1] : null;
}

function parseByline($: cheerio.CheerioAPI, site: SiteConfig): {
  brand: { name: string | null; byline?: string | null; link: string | null; store_link: string | null } | null;
  authors: Array<{ name: string; role?: string | null; link?: string | null }>;
} {
  const byline = $("#bylineInfo").first();
  if (!byline.length) {
    return { brand: null, authors: [] };
  }
  const label = clean(byline.text()) || "";
  const href = byline.attr("href");
  const authors: Array<{ name: string; role?: string | null; link?: string | null }> = [];

  $("#bylineInfo .author a.a-link-normal, #bylineInfo .author a.contributorNameID").each((_, a) => {
    const name = clean($(a).text());
    if (name) {
      const parent = $(a).closest(".author");
      const roleEl = parent.find(".contribution").first();
      const role = clean(roleEl.text()?.replace(/[()]/g, ""));
      authors.push({
        name,
        role: role || null,
        link: absolute(site, $(a).attr("href"))
      });
    }
  });

  let name = label.replace(/^(Visit the|Brand:|Marke:|Marca:|Marque\s*:|قم بزيارة متجر|العلامة التجارية:?|المتجر:?)\s*/i, "");
  name = name.replace(/\s+(Store|متجر)$/i, "").trim() || "";

  let brand: any = null;
  if (href && href.includes("/stores/")) {
    brand = { name: name || null, link: absolute(site, href), store_link: absolute(site, href) };
  } else if (href) {
    brand = { name: name || null, link: absolute(site, href), store_link: null };
  } else if (name && authors.length === 0) {
    brand = { name, link: null, store_link: null };
  }

  return { brand, authors };
}

function parseBestSellersRank($: cheerio.CheerioAPI, site: SiteConfig): any[] {
  let matchedEl: cheerio.Cheerio<any> | null = null;
  const bsrRegex = /Best[- ]?Sellers? Rank|Bestseller-Rang|Classement des meilleures|Posizione nella|Clasificación|الأكثر مبيعاً|المركز/i;

  $("*").each((_, el) => {
    if (matchedEl) return;
    const directText = $(el).contents().filter((__, n) => n.type === "text").text();
    if (bsrRegex.test(directText)) {
      matchedEl = $(el);
    }
  });

  if (!matchedEl) {
    return [];
  }

  const container = (matchedEl as any).closest("tr, li, div");
  if (!container || !container.length) {
    return [];
  }

  let block = clean(container.text()) || "";
  block = block.replace(/\(\s*See Top \d+[^)]*\)/g, " ");

  const links: Record<string, string> = {};
  container.find("a[href]").each((_: any, a: any) => {
    const t = clean($(a).text());
    const h = $(a).attr("href");
    if (t && h) {
      const abs = absolute(site, h);
      if (abs) links[t] = abs;
    }
  });

  const ranks: any[] = [];
  const regex = /#?\s*([\d,. ]+)\s+(?:in|en|dans|in der|su|في)\s+([^(#]+?)(?=\s*\(|\s*#|$)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(block)) !== null) {
    const rank = toInt(m[1]);
    const category = clean(m[2]);
    if (!rank || !category || category.toLowerCase().startsWith("see top")) {
      continue;
    }
    let link: string | null = null;
    for (const [k, v] of Object.entries(links)) {
      if (k === category || category.includes(k) || k.includes(category)) {
        link = v;
        break;
      }
    }
    const catIdMatch = link ? link.match(/\/(\d+)(?:\/|$)/) : null;
    ranks.push({
      rank,
      category,
      link,
      category_id: catIdMatch ? catIdMatch[1] : null
    });
  }

  return ranks;
}

function parseHistogram($: cheerio.CheerioAPI): Record<string, number> | null {
  const out: Record<string, number> = {};
  const histRegex = /(\d+)\s*(?:percent|%)[^\d]*(\d)\s*star/i;
  $("#histogramTable [aria-label], #histogramTable a[title]").each((_, el) => {
    const str = $(el).attr("aria-label") || $(el).attr("title") || "";
    const m = str.match(histRegex);
    if (m) {
      const count = toInt(m[1]);
      if (count !== null) {
        out[`${m[2]}_star`] = count;
      }
    }
  });
  return Object.keys(out).length > 0 ? out : null;
}

function parseVariations(htmlText: string, site: SiteConfig): any {
  const display = jsonAfter(htmlText, '"dimensionValuesDisplayData"');
  if (!display || typeof display !== "object" || Object.keys(display).length === 0) {
    return null;
  }
  const labels = jsonAfter(htmlText, '"variationDisplayLabels"') || {};
  const dims = jsonAfter(htmlText, '"dimensions"', "[") || Object.keys(labels);
  const values = jsonAfter(htmlText, '"variationValues"') || {};

  const currentMatch = htmlText.match(/"currentAsin"\s*:\s*"([A-Z0-9]{10})"/);
  const parentMatch = htmlText.match(/"parentAsin"\s*:\s*"([A-Z0-9]{10})"/);
  const current = currentMatch ? currentMatch[1] : null;
  const parent = parentMatch ? parentMatch[1] : null;

  const dimensions = dims.map((key: string) => ({
    key,
    name: labels[key] || key,
    values: values[key] || []
  }));

  const products: any[] = [];
  for (const [vAsin, vals] of Object.entries(display)) {
    const valArray = vals as string[];
    const attrs: Record<string, string> = {};
    valArray.forEach((v, i) => {
      const dimKey = dims[i];
      const name = dimKey ? labels[dimKey] || dimKey : `dimension_${i}`;
      attrs[name] = v;
    });
    products.push({
      asin: vAsin,
      attributes: attrs,
      link: productLink(site, vAsin),
      is_current: vAsin === current
    });
  }

  return {
    parent_asin: parent,
    current_asin: current,
    dimensions,
    products,
    count: products.length
  };
}

function parseImages(htmlText: string, $?: cheerio.CheerioAPI, asin?: string): any[] {
  const images: any[] = [];
  const seen = new Set<string>();

  function addImage(
    link: string | null | undefined,
    thumb: string | null = null,
    large: string | null = null,
    variant: string | null = null
  ) {
    if (!link || typeof link !== "string") return;
    if (seen.has(link)) return;
    if (link.includes("play-button") || link.includes("transparent-pixel") || link.includes("sprite") || link.includes("icon")) {
      return;
    }
    seen.add(link);
    images.push({
      link,
      thumbnail: thumb || null,
      large: large || link,
      variant: variant || null
    });
  }

  // 1. Direct Cheerio DOM extraction for the active landing image
  let landingUrl: string | null = null;
  if ($) {
    const landingEl = $("#landingImage, #imgBlkFront, #main-image, #ebooks-img-canvas img").first();
    if (landingEl.length) {
      const oldHires = landingEl.attr("data-old-hires");
      if (oldHires && oldHires.trim()) {
        landingUrl = oldHires.trim();
      }

      if (!landingUrl) {
        const dyn = landingEl.attr("data-a-dynamic-image");
        if (dyn) {
          try {
            const parsed = JSON.parse(dyn);
            let maxPx = 0;
            let bestUrl: string | null = null;
            for (const [url, dims] of Object.entries(parsed)) {
              const px = Array.isArray(dims) && dims.length === 2 ? Number(dims[0]) * Number(dims[1]) : 0;
              if (px > maxPx) {
                maxPx = px;
                bestUrl = url;
              }
            }
            if (bestUrl) landingUrl = bestUrl;
          } catch (_) {}
        }
      }

      if (!landingUrl) {
        const src = landingEl.attr("src");
        if (src && !src.includes("data:image")) {
          landingUrl = src.trim();
        }
      }
    }
  }

  // If landingUrl was found, add it as MAIN at index 0
  if (landingUrl) {
    addImage(landingUrl, null, landingUrl, "MAIN");
  }

  // 2. Color/Variant images from embedded JSON
  const colorImages = jsonAfter(htmlText, '"colorImages"');
  if (colorImages && typeof colorImages === "object") {
    let selectedGroup: any[] | null = null;
    if (Array.isArray(colorImages.initial)) {
      selectedGroup = colorImages.initial;
    } else if (asin && Array.isArray((colorImages as any)[asin])) {
      selectedGroup = (colorImages as any)[asin];
    } else {
      for (const [, v] of Object.entries(colorImages)) {
        if (Array.isArray(v)) {
          selectedGroup = v;
          break;
        }
      }
    }

    if (selectedGroup && Array.isArray(selectedGroup)) {
      for (const entry of selectedGroup) {
        const link = entry.hiRes || entry.large;
        addImage(link, entry.thumb || null, entry.large || null, entry.variant || null);
      }
    }
  }

  // 3. Fallback: Cheerio altImages gallery
  if ($ && images.length <= 1) {
    $("#altImages ul li.item:not(.video) img, #imageBlock .regularAltImageViewLayout img").each((_, img) => {
      const el = $(img);
      if (el.closest(".swatchAvailable, #variation_color_name").length) return;
      const raw = el.attr("data-old-hires") || el.attr("src") || el.attr("data-src");
      if (raw) {
        const hiRes = raw.replace(/\._[A-Z0-9_,-]+_\./, "._AC_SL1500_.");
        addImage(hiRes, raw, hiRes, "PT");
      }
    });
  }

  // 4. Fallback string regex if Cheerio wasn't passed or no images found
  if (images.length === 0) {
    const landingMatch =
      htmlText.match(/id="landingImage"[^>]*\sdata-old-hires="([^"]+)"/) ||
      htmlText.match(/id="landingImage"[^>]*\ssrc="([^"]+)"/);
    if (landingMatch) {
      addImage(landingMatch[1], null, landingMatch[1], "MAIN");
    }
  }

  return images;
}

function parseVideos(htmlText: string): any[] {
  const raw = jsonAfter(htmlText, '"videos":', "[");
  const out: any[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "object" && v.url) {
        out.push(
          compact({
            title: v.title,
            link: v.url,
            thumbnail: v.thumb,
            duration_seconds: v.durationSeconds,
            language: v.languageCode,
            is_hero: v.isHeroVideo,
            creator: v.creatorProfile?.name
          })
        );
      }
    }
  }
  return out;
}

function parseReview($card: cheerio.Cheerio<any>, site: SiteConfig): any {
  const idAttr = $card.attr("id") || "";
  const rid = idAttr.replace("customer_review-", "") || null;
  const profile = $card.find("a.a-profile").first();
  const profileHref = profile.attr("href");

  const dateText = clean($card.find("[data-hook=review-date]").first().text()) || "";
  const match = dateText.match(/Reviewed in (?:the )?(.+?) on (.+)$/);

  const bodyEl =
    $card.find("[data-hook=reviewText] [data-hook=reviewRichContentContainer]").first().length
      ? $card.find("[data-hook=reviewText] [data-hook=reviewRichContentContainer]").first()
      : $card.find("[data-hook=reviewText]").first().length
      ? $card.find("[data-hook=reviewText]").first()
      : $card.find("[data-hook=review-body]").first();

  let bodyText: string | null = null;
  if (bodyEl.length) {
    const pEls = bodyEl.find("p");
    const texts = pEls.length
      ? pEls.map((_, p) => cheerio.load(p).text()).get().join(" ")
      : bodyEl.text();
    bodyText = clean(texts);
    if (bodyText) {
      bodyText = clean(bodyText.replace(/(Brief|Full) content visible, double tap to read (full|brief) content\./g, ""));
    }
  }

  const helpful = clean($card.find("[data-hook=helpful-vote-statement]").first().text());
  let helpfulVotes = helpful ? toInt(helpful) || 0 : 0;
  if (helpful && helpful.toLowerCase().startsWith("one person")) {
    helpfulVotes = 1;
  }

  const titleEl = $card.find("[data-hook=reviewTitle], [data-hook=review-title]").first();
  const titleLink = $card.find("a[href*='customer-reviews/srp'], a[data-hook=review-title]").first();

  const authorIdMatch = profileHref ? profileHref.match(/profile\/([\w.]+)/) : null;

  const reviewImages: string[] = [];
  $card.find("img[data-hook=review-image-tile]").each((_, img) => {
    const src = fullImage(cheerio.load(img)("img").attr("src"));
    if (src) reviewImages.push(src);
  });

  return {
    id: rid,
    title: clean(titleEl.text()),
    link: titleLink.length
      ? absolute(site, titleLink.attr("href"))
      : rid
      ? `${site.base}/gp/customer-reviews/${rid}`
      : null,
    rating: ratingOf($card.find("[data-hook=review-star-rating] .a-icon-alt, [data-hook=cmps-review-star-rating] .a-icon-alt").first().text()),
    date: match ? isoDate(match[2]) : isoDate(dateText),
    date_text: dateText || null,
    country: match ? clean(match[1]) : null,
    text: bodyText,
    author: {
      name: clean($card.find(".a-profile-name").first().text()),
      link: absolute(site, profileHref),
      id: authorIdMatch ? authorIdMatch[1] : null
    },
    variant: clean($card.find("[data-hook=format-strip]").first().text()),
    is_verified_purchase: $card.find("[data-hook=avp-badge]").length > 0,
    is_vine: ($card.find("[data-hook=review-badges]").first().text() || "").toLowerCase().includes("vine"),
    helpful_votes: helpfulVotes,
    images: reviewImages,
    has_video: $card.find("[data-hook=reviewVideo], video").length > 0
  };
}

function parseCustomersSay(htmlText: string): any {
  let summary: string | null = null;
  const aspects: any[] = [];

  const tokens = Array.from(htmlText.matchAll(/k\+b64 ([A-Za-z0-9+/=]+)/g));
  for (const token of tokens) {
    try {
      // Decode base64 in Node/V8
      const rawJson = Buffer.from(token[1], "base64").toString("utf-8");
      const blob = JSON.parse(rawJson);
      const component = String(blob["k-component"] || "");
      const data = blob["k-data"] || {};

      if (component.startsWith("SummaryFragments") && summary === null) {
        const frags = (data.fragments || []).map((f: any) => f.inertText || "").join(" ");
        summary = clean(frags);
      } else if (component.startsWith("AspectList") && aspects.length === 0) {
        for (const aspect of data.aspectsFlattened || []) {
          const snippets: any[] = [];
          for (const snip of aspect.snippets || []) {
            let frag = "";
            for (const f of snip.text?.fragments || []) {
              frag += f.text || f.semanticContent?.content?.text || "";
            }
            const reviewUrl = snip.review?.url || "";
            const ridMatch = reviewUrl.match(/\/-\/(\w+)/);
            snippets.push({
              text: clean(frag),
              review_id: ridMatch ? ridMatch[1] : null
            });
          }
          aspects.push({
            name: aspect.label,
            sentiment: aspect.sentiment,
            summary: aspect.summary,
            mentions: aspect.mentions,
            mentions_percentage: aspect.mentionsPercentage,
            snippets
          });
        }
      }
    } catch {
      continue;
    }
  }

  if (summary === null && aspects.length === 0) {
    return null;
  }
  return { summary, aspects, is_ai_generated: true };
}

function parseDelivery($: cheerio.CheerioAPI): Delivery | null {
  const slots: any[] = [];
  $("[data-csa-c-delivery-time]").each((_, el) => {
    slots.push(
      compact({
        type: $(el).attr("data-csa-c-delivery-type") || null,
        price_text: $(el).attr("data-csa-c-delivery-price") || null,
        time: $(el).attr("data-csa-c-delivery-time") || null,
        cutoff: $(el).attr("data-csa-c-delivery-cutoff") || null,
        text: clean($(el).text())
      })
    );
  });

  const seen = new Set<string>();
  const unique: any[] = [];
  for (const s of slots) {
    const key = `${s.type}:${s.time}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }

  const primary =
    clean($("#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE, #deliveryBlockMessage").first().text());
  const secondary =
    clean($("#mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE_LARGE").first().text());
  const location =
    clean($("#glow-ingress-line2, #contextualIngressPtLabel_deliveryShortLine").first().text());

  if (!primary && unique.length === 0 && !location) {
    return null;
  }
  return {
    text: primary || null,
    fastest_text: secondary || null,
    location: location || null
  };
}

function parseBuybox($: cheerio.CheerioAPI, site: SiteConfig): Buybox | null {
  const sellerLink = $("#sellerProfileTriggerId").first();
  const merchant = clean($("#merchantInfoFeature_feature_div, #merchant-info").first().text()) || "";
  let shipsFrom: string | null = null;
  let soldBy: string | null = null;

  $("#tabular-buybox [tabular-attribute-name]").each((_, cell) => {
    const label = ($(cell).attr("tabular-attribute-name") || "").toLowerCase();
    const val = clean($(cell).find(".tabular-buybox-text-message").first().text()) || clean($(cell).text());
    if (label.includes("ships from") || label.includes("dispatches from") || label.includes("يشحن من") || label.includes("الشحن من")) {
      shipsFrom = shipsFrom || val;
    } else if (label.includes("sold by") || label.includes("يباع من") || label.includes("بيع من قبل")) {
      soldBy = soldBy || val;
    }
  });

  const bothMatch = merchant.match(/(?:Shipper\s*\/\s*Seller|الشاحن\s*\/\s*البائع)\s+(.+?)(?:\s+Shipper|\s+الشاحن|\s*$)/i);
  if (bothMatch) {
    let name = clean(bothMatch[1]);
    if (name) {
      const parts = name.split(" ");
      if (parts.length >= 2 && parts[0] === parts[1]) {
        name = parts[0];
      }
    }
    shipsFrom = shipsFrom || name;
    soldBy = soldBy || name;
  }

  const shipsMatch = merchant.match(/(?:Ships from|Dispatches from|يشحن من|الشحن من)\s*:?\s*(.+?)(?=\s+Sold by|\s+يباع من|\s*\.|\s*$)/i);
  if (shipsMatch && !shipsFrom) {
    shipsFrom = clean(shipsMatch[1]);
  }
  const soldMatch = merchant.match(/(?:Sold by|يباع من قبل|يباع من)\s*:?\s*(.+?)(?:\s+and\s+Fulfilled|\s+و\s+تشحن|\s*\.|$)/i);
  if (soldMatch && !soldBy) {
    soldBy = clean(soldMatch[1]);
  }

  let sellerId: string | null = null;
  if (sellerLink.length) {
    const href = sellerLink.attr("href") || "";
    try {
      const u = new URL(href, site.base);
      sellerId = u.searchParams.get("seller");
    } catch {
      // ignore
    }
    soldBy = clean(sellerLink.text()) || soldBy;
  }

  if (!soldBy && !shipsFrom && !merchant) {
    return null;
  }

  const merchantLow = merchant.toLowerCase();
  const shipsFromLow = (shipsFrom || "").toLowerCase();
  const soldByLow = (soldBy || "").toLowerCase();

  return {
    seller: soldBy
      ? {
          name: soldBy,
          id: sellerId,
          link: sellerId ? `${site.base}/sp?seller=${sellerId}` : null
        }
      : null,
    ships_from: shipsFrom,
    is_fulfilled_by_amazon:
      merchantLow.includes("fulfilled by amazon") ||
      shipsFromLow.startsWith("amazon") ||
      merchant.includes("أمازون") ||
      (shipsFrom || "").includes("أمازون"),
    is_sold_by_amazon: soldByLow.startsWith("amazon") || (soldBy || "").includes("أمازون")
  };
}

function parseAvailability($: cheerio.CheerioAPI): { text: string | null; is_in_stock: boolean; quantity_left: number | null } {
  const el = $("#availability").first();
  const status = clean(el.find("span").first().text()) || clean(el.text());
  if (!status) {
    return { text: null, is_in_stock: false, quantity_left: null };
  }
  const low = status.toLowerCase();
  let inStock = false;
  if (["in stock", "only", "usually ships", "available", "verfügbar", "en stock", "disponible", "متوفر", "متبقي", "جاهز للشحن"].some(k => low.includes(k))) {
    inStock = true;
  }
  if (["unavailable", "out of stock", "not available", "nicht verfügbar", "indisponible", "غير متوفر", "غير متاح"].some(k => low.includes(k))) {
    inStock = false;
  }
  const leftMatch = low.match(/(?:only\s+(\d+)\s+left|متبقي\s+(\d+)\s+فقط)/i);
  return {
    text: status,
    is_in_stock: inStock,
    quantity_left: leftMatch ? toInt(leftMatch[1] || leftMatch[2]) : null
  };
}

function parsePrice($: cheerio.CheerioAPI, currency: string): Money | null {
  const scopes = [
    $("#apex_desktop"),
    $("#apex_desktop_feature_div"),
    $("#corePriceDisplay_desktop_feature_div"),
    $("#corePrice_feature_div"),
    $("#corePrice_desktop"),
    $("#tp_price_block_total_price_ww"),
    $("#price"),
    $("#buybox")
  ];

  let currentEl: cheerio.Cheerio<any> | null = null;
  let strikeEl: cheerio.Cheerio<any> | null = null;
  let foundScope: cheerio.Cheerio<any> | null = null;

  for (const scope of scopes) {
    if (!scope.length) continue;
    const cur = scope.find(".priceToPay .a-offscreen, .apexPriceToPay .a-offscreen, .a-price:not([data-a-strike=true]) .a-offscreen").first();
    const offscreen = cur.length ? cur : scope.find(".aok-offscreen, .priceBlockBuyingPriceString, #priceblock_ourprice, #priceblock_dealprice").first();
    if (offscreen.length && amountOf(clean(offscreen.text())) !== null) {
      currentEl = offscreen;
      strikeEl = scope.find(".basisPrice .a-offscreen, [data-a-strike=true] .a-offscreen, .a-text-price .a-offscreen").first();
      foundScope = scope;
      break;
    }
  }

  // Fallback: check whole and fraction if no offscreen matched
  if (!currentEl) {
    for (const scope of scopes) {
      if (!scope.length) continue;
      const whole = scope.find(".a-price-whole").first();
      const fraction = scope.find(".a-price-fraction").first();
      if (whole.length) {
        const assembled = `${whole.text().trim()}.${fraction.length ? fraction.text().trim() : "00"}`;
        if (amountOf(assembled) !== null) {
          currentEl = whole;
          foundScope = scope;
          break;
        }
      }
    }
  }

  if (!foundScope) {
    return null;
  }

  const currentText = currentEl ? clean(currentEl.text()) : null;
  let block: Money | null = currentText ? money(currentText, currency) : null;
  if (!block) {
    block = { amount: null, currency };
  }

  const strikeText = strikeEl && strikeEl.length ? clean(strikeEl.text()) : null;
  block.list_price = strikeText ? amountOf(strikeText) : null;

  const savings = clean(foundScope.find(".savingsPercentage").first().text());
  if (savings && percentOf(savings) !== null) {
    block.savings_percent = Math.abs(percentOf(savings)!);
  } else if (block.amount && block.list_price && block.list_price > block.amount) {
    block.savings_percent = Math.round((1 - block.amount / block.list_price) * 100);
  } else {
    block.savings_percent = null;
  }

  if (block.amount && block.list_price && block.list_price > block.amount) {
    block.savings_amount = Math.round((block.list_price - block.amount) * 100) / 100;
  } else {
    block.savings_amount = null;
  }

  const unit = clean(foundScope.find(".pricePerUnit, #pricePerUnit").first().text()) || "";
  const unitMatch = unit.match(/\(?\s*([^()/]*?\d[^()/]*?)\s*\/\s*([^()]+?)\s*\)?$/);
  block.unit_price = unitMatch ? { amount: amountOf(unitMatch[1]), per: clean(unitMatch[2]) } : null;

  if (block.amount === null && block.list_price === null) {
    return null;
  }
  return block;
}
