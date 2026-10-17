import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { parseSellerPage } from "../src/parsers/seller";
import { site } from "../src/sites";

const FX = path.resolve(__dirname, "../../amazon-scraper/amazon/fixtures");
const US = site("US");

function raw(name: string): string {
  const buf = fs.readFileSync(path.join(FX, name + ".gz"));
  return zlib.gunzipSync(buf).toString("utf-8");
}

describe("seller parser", () => {
  it("parses seller page (seller_A1D09S7Q0OD6TH)", () => {
    const s = parseSellerPage(raw("seller_A1D09S7Q0OD6TH.html"), US);
    expect(s.id).toBe("A1D09S7Q0OD6TH");
    expect(s.name).toBe("FBA Top G");
    expect(s.storefront_link?.endsWith("me=A1D09S7Q0OD6TH")).toBe(true);
    expect(s.rating.positive_percent).toBe(84.0);
    expect(s.rating.count).toBe(304);
    expect(s.ratings.lifetime?.stars["5_star"]).toBe(235);
    expect(s.ratings.one_month?.count).toBe(0);
    expect(s.business.name).toBe("Fba fund llc");
    expect(s.business.address?.includes("NJ")).toBe(true);
    expect(s.about?.startsWith("FBA Top G is committed")).toBe(true);
  });
});
