import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { parseSearchPage } from "../src/parsers/search";
import { site } from "../src/sites";

const FX = path.resolve(__dirname, "../../amazon-scraper/amazon/fixtures");
const US = site("US");
const DE = site("DE");

function raw(name: string): string {
  const buf = fs.readFileSync(path.join(FX, name + ".gz"));
  return zlib.gunzipSync(buf).toString("utf-8");
}

describe("search parser", () => {
  it("parses search page (search_laptop_p2)", () => {
    const page = parseSearchPage(raw("search_laptop_p2.html"), US);
    expect(page.total_count).toBe(100000);
    expect(page.is_total_approximate).toBe(true);
    expect(page.current_page).toBe(2);
    expect(page.total_pages).toBe(20);

    const results = page.results;
    expect(results.length).toBeGreaterThanOrEqual(16);

    const organic = results.filter(r => !r.is_sponsored);
    expect(organic.length).toBeGreaterThan(0);

    const card = organic.find(r => r.price?.amount && r.rating?.average);
    expect(card).toBeDefined();
    expect(card?.asin).toBeDefined();
    expect(card?.title).toBeDefined();
    expect(card?.link).toBe(`https://www.amazon.com/dp/${card?.asin}`);
    expect(card?.price?.currency).toBe("USD");
    expect(card?.price?.amount).toBeGreaterThan(0);
    expect(card?.rating?.average).toBeGreaterThan(0);
    expect(card?.rating?.average).toBeLessThanOrEqual(5);
    expect(card?.rating?.count).toBeGreaterThan(0);
    expect(card?.image?.endsWith(".jpg")).toBe(true);
    expect(card?.image?.includes("._")).toBe(false);

    const deal = results.find(r => r.badges.is_limited_time_deal);
    expect(deal).toBeDefined();
    expect(deal?.price?.list_price).toBeDefined();
    expect(["Typical", "List"]).toContain(deal?.price?.list_price_type);
    expect(results.some(r => Boolean(r.bought_past_month))).toBe(true);

    const brands = page.refinements.find(f => f.id === "p_123");
    expect(brands).toBeDefined();
    expect(brands?.name).toBe("Brands");
    expect(Boolean(brands?.options[0]?.value)).toBe(true);
    expect(Boolean(brands?.options[0]?.link)).toBe(true);

    expect(page.search_aliases?.some(a => a.id === "aps")).toBe(true);
  });

  it("parses German search, ISBN search, and browse node", () => {
    const dePage = parseSearchPage(raw("de_search_laptop.html"), DE);
    expect(dePage.results.length).toBeGreaterThan(0);
    expect(
      dePage.results.filter(r => r.price).every(r => r.price?.currency === "EUR")
    ).toBe(true);
    expect(dePage.results.some(r => r.badges.is_amazons_choice)).toBe(true);
    expect(dePage.results.some(r => r.is_sponsored)).toBe(true);
    expect(dePage.results.some(r => !r.is_sponsored)).toBe(true);

    const isbn = parseSearchPage(raw("search_isbn.html"), US);
    expect(isbn.results.length).toBeGreaterThan(0);
    expect(isbn.results[0].title?.includes("Clean Code")).toBe(true);

    const node = parseSearchPage(raw("browse_node_172282.html"), US);
    expect(node.departments[0].is_selected).toBe(true);
    expect(node.departments[1].node_id).toBe("281407");
  });
});
