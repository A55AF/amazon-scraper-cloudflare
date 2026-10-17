import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { parseOffersPage } from "../src/parsers/offers";
import { site } from "../src/sites";

const FX = path.resolve(__dirname, "../../amazon-scraper/amazon/fixtures");
const US = site("US");

function raw(name: string): string {
  const buf = fs.readFileSync(path.join(FX, name + ".gz"));
  return zlib.gunzipSync(buf).toString("utf-8");
}

describe("offers parser", () => {
  it("parses offers page (aod_B00939I7EK)", () => {
    const o = parseOffersPage(raw("aod_B00939I7EK.html"), US);
    expect(o.title?.startsWith("Ninja")).toBe(true);
    expect(o.rating?.count).toBe(43049);
    expect(o.other_offers_count).toBe(4);

    const offers = o.offers;
    expect(offers[0].is_pinned).toBe(true);
    expect(offers[0].condition).toBe("New");
    expect(offers[0].price?.amount).toBe(179.99);
    expect(offers[0].price?.list_price).toBe(219.99);
    expect(offers[0].price?.savings_percent).toBe(18.0);

    const used = offers.find(x => x.condition?.startsWith("Used"));
    expect(used).toBeDefined();
    expect(used?.condition_note).toBeDefined();
    expect(used?.price?.amount).toBeDefined();
    expect(used?.seller?.name).toBeDefined();

    const third = offers.find(x => x.seller && x.seller.id);
    expect(third).toBeDefined();
    expect(third?.seller?.link?.endsWith(third.seller.id!)).toBe(true);
    expect(third?.seller?.positive_percent).toBeDefined();

    expect(offers.every(x => Boolean(x.delivery?.text))).toBe(true);
  });
});
