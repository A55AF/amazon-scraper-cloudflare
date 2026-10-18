import { describe, it, expect } from "vitest";
import {
  money,
  ratingOf,
  toInt,
  boughtPastMonth,
  isoDate,
  fullImage,
  absolute,
  nodeIn,
  snake
} from "../src/parsers/helpers";
import { site } from "../src/sites";

const US = site("US");

describe("helpers", () => {
  it("parses money correctly", () => {
    expect(money("$1,299.99", "USD")).toEqual({
      amount: 1299.99,
      currency: "USD"
    });
    expect(money("€749.00", "USD")?.currency).toBe("EUR");
    expect(money("INR 372,862.44", "USD")).toEqual({
      amount: 372862.44,
      currency: "INR"
    });
    expect(money("$4,699.00", "AUD")).toEqual({
      amount: 4699.0,
      currency: "AUD"
    });
    expect(money("C$19.99", "USD")?.currency).toBe("CAD");
  });

  it("parses ratings and counts", () => {
    expect(ratingOf("4.7 out of 5 stars")).toBe(4.7);
    expect(ratingOf("4,2 von 5 Sternen")).toBe(4.2);
    expect(toInt("(43,049)")).toBe(43049);
    expect(boughtPastMonth("6K+ bought in past month")).toBe(6000);
    expect(boughtPastMonth("200+ bought in past month")).toBe(200);
  });

  it("parses dates, images, and urls", () => {
    expect(isoDate("July 26, 2026")).toBe("2026-07-26");
    expect(isoDate("27 August 2026")).toBe("2026-08-27");
    expect(
      fullImage("https://m.media-amazon.com/images/I/61kp09SeFyL._AC_UY218_.jpg")
    ).toBe("https://m.media-amazon.com/images/I/61kp09SeFyL.jpg");
    expect(
      absolute(
        US,
        "/Lenovo-X/dp/B0CBJ46QZX/ref=sr_1_5?dib=abc&keywords=laptop&qid=1&sr=8-5"
      )
    ).toBe("https://www.amazon.com/Lenovo-X/dp/B0CBJ46QZX");
    expect(
      nodeIn("/s?k=laptop&i=computers&rh=n%3A172282%2Cn%3A541966")
    ).toBe("541966");
    expect(snake("Best Sellers Rank")).toBe("best_sellers_rank");
  });

  it("parses Arabic numbers, currencies, ratings, and Unicode keys", () => {
    expect(money("١٬٢٩٩٫٠٠ ج.م.", "EGP")).toEqual({
      amount: 1299.0,
      currency: "EGP"
    });
    expect(money("1,299.00 جنيه", "EGP")?.currency).toBe("EGP");
    expect(money("ر.س 450.00", "SAR")).toEqual({
      amount: 450.0,
      currency: "SAR"
    });
    expect(ratingOf("٤٫٥ من ٥ نجوم")).toBe(4.5);
    expect(ratingOf("4.2 من 5")).toBe(4.2);
    expect(toInt("٩٣ تقييم")).toBe(93);
    expect(boughtPastMonth("تم شراء 1K+ في الشهر الماضي")).toBe(1000);
    expect(snake("العلامة التجارية")).toBe("العلامة_التجارية");
  });
});
