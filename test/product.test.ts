import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { parseProductPage, reviewTreatment } from "../src/parsers/product";
import { site } from "../src/sites";

const FX = path.resolve(__dirname, "../../amazon-scraper/amazon/fixtures");
const US = site("US");
const GB = site("GB");

function raw(name: string): string {
  const buf = fs.readFileSync(path.join(FX, name + ".gz"));
  return zlib.gunzipSync(buf).toString("utf-8");
}

describe("product parser", () => {
  it("parses blender product page (dp_B00939I7EK_reviews)", () => {
    const d = parseProductPage(raw("dp_B00939I7EK_reviews.html"), US);
    expect(d.asin).toBe("B00939I7EK");
    expect(d.title?.startsWith("Ninja Kitchen System Pro")).toBe(true);
    expect(d.brand?.name).toBe("Ninja");
    expect(d.price?.amount).toBe(179.99);
    expect(d.price?.currency).toBe("USD");
    expect(d.availability.is_in_stock).toBe(true);
    expect(d.buybox?.is_sold_by_amazon).toBe(true);
    expect(d.buybox?.ships_from).toBe("Amazon.com");
    expect(d.delivery?.text?.startsWith("FREE delivery")).toBe(true);
    expect(d.delivery?.location?.startsWith("New York")).toBe(true);
    expect(d.rating?.average).toBe(4.7);
    expect(d.rating?.count).toBe(43049);
    expect(d.rating?.histogram?.["5_star"]).toBe(85);
    expect(d.bought_past_month).toBe(6000);
    expect(d.categories.slice(0, 2).map(c => c.name)).toEqual(["Home & Kitchen", "Kitchen & Dining"]);

    expect(d.best_sellers_rank[0].rank).toBe(649);
    expect(Boolean(d.best_sellers_rank[0].link)).toBe(true);
    expect(d.best_sellers_rank[1]).toEqual({
      rank: 6,
      category: "Food Processors",
      link: "https://www.amazon.com/gp/bestsellers/kitchen/289920",
      category_id: "289920"
    });

    expect(d.bullets.length).toBeGreaterThanOrEqual(8);
    expect(d.overview?.brand).toBe("Ninja");
    expect(d.details?.model_number).toBe("BL770");
    expect(d.identifiers?.upc?.startsWith("622356532419")).toBe(true);
    expect(d.details?.best_sellers_rank).toBeUndefined();

    expect(d.images[0].link.startsWith("https://m.media-amazon.com/")).toBe(true);
    expect(d.images[0].variant).toBe("MAIN");
    expect(d.videos.length).toBeGreaterThan(0);
    expect(d.videos[0].duration_seconds).toBeDefined();
    expect(d.videos[0].link).toBeDefined();

    expect(d.variations?.current_asin).toBe("B00939I7EK");
    expect(d.variations?.dimensions[0].name).toBe("Style");
    expect(d.variations?.products.some(p => p.asin === "B00939FV8K")).toBe(true);

    expect(d.customers_say?.summary?.startsWith("Customers find")).toBe(true);
    expect(Boolean(d.customers_say?.aspects[0].sentiment)).toBe(true);

    expect(d.top_reviews.length).toBe(13);
    expect(d.has_inline_reviews).toBe(true);

    const review = d.top_reviews[0];
    expect(review.id).toBe("RVNTQROOLDP79");
    expect(review.rating).toBe(5.0);
    expect(review.date).toBe("2026-07-26");
    expect(review.country).toBe("United States");
    expect(review.is_verified_purchase).toBe(true);
    expect(review.helpful_votes).toBe(40);
    expect(Boolean(review.author.name)).toBe(true);
    expect(review.author.link?.startsWith("https://www.amazon.com/gp/profile/")).toBe(true);
    expect(review.text).toBeDefined();
    expect(review.text?.includes("double tap")).toBe(false);
  });

  it("parses variants, book, and GB page", () => {
    const d = parseProductPage(raw("dp_B09SM24S8C.html"), US);
    expect(d.brand?.name).toBe("Samsung");
    expect(d.brand?.byline).toBe("Amazon Renewed");
    expect(d.availability.quantity_left).toBe(2);
    expect(d.buybox?.seller).toEqual({
      name: "BesTechDeal",
      id: "A1OFNH7X27CXTU",
      link: "https://www.amazon.com/sp?seller=A1OFNH7X27CXTU"
    });

    const dimNames = new Set(d.variations?.dimensions.map(dim => dim.name));
    expect(dimNames).toEqual(new Set(["Color", "Size"]));
    expect(d.variations?.products[0].attributes["Size"]).toBe("32GB");
    expect(Boolean(d.important_information)).toBe(true);

    const book = parseProductPage(raw("dp_0132350882.html"), US);
    expect(book.authors?.[0].name).toBe("Robert C. Martin");
    expect(book.authors?.[0].role).toBe("Author");
    expect(book.details?.isbn_13).toBe("978-0132350884");
    expect(Boolean(book.identifiers?.isbn_10)).toBe(true);
    expect(book.best_sellers_rank[0].category).toBe("Books");

    const gb = parseProductPage(raw("gb_dp_B0HGXMZ2SD.html"), GB);
    expect(gb.price?.currency).toBe("GBP");
    expect(gb.link).toBe("https://www.amazon.co.uk/dp/B0HGXMZ2SD");
    expect(gb.top_reviews[0].country).toBe("United Kingdom");
    expect(Boolean(gb.top_reviews[0].images)).toBe(true);

    const treat = reviewTreatment(raw("dp_B00939I7EK.html"));
    expect(["C", "T1"]).toContain(treat);
  });

  it("parses jewelry facts layout (dp_B07QSFHT27)", () => {
    const d = parseProductPage(raw("dp_B07QSFHT27.html"), US);
    expect(d.title?.startsWith("PAVOI")).toBe(true);
    expect(d.bullets[0].startsWith("HIGHLIGHTS")).toBe(true);
    expect(d.details?.metal_type).toBe("14k gold plated");
    expect(Boolean(d.brand?.name)).toBe(true);
  });
});
