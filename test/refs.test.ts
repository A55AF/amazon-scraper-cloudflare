import { describe, it, expect } from "vitest";
import {
  resolveProduct,
  resolveSeller,
  resolveInfluencer,
  resolvePost,
  resolveNode,
  resolveBestsellerCategory,
  resolveQuery,
  countryOf,
  pageType
} from "../src/refs";

describe("refs", () => {
  it("resolves product", () => {
    expect(resolveProduct("b00939i7ek")).toBe("B00939I7EK");
    expect(resolveProduct("0132350882")).toBe("0132350882");
    expect(
      resolveProduct(
        "https://www.amazon.com/Ninja-Kitchen-System/dp/B00939I7EK/ref=sr_1_1?keywords=x"
      )
    ).toBe("B00939I7EK");
    expect(
      resolveProduct("https://www.amazon.de/gp/product/B0DS2LB2DT")
    ).toBe("B0DS2LB2DT");
    expect(
      resolveProduct("amazon.co.uk/product-reviews/B0HGXMZ2SD")
    ).toBe("B0HGXMZ2SD");
    expect(() => resolveProduct("not-an-asin")).toThrow();
    expect(() => resolveProduct("https://www.amazon.com/s?k=laptop")).toThrow();
  });

  it("resolves seller and influencer", () => {
    expect(resolveSeller("A1D09S7Q0OD6TH")).toBe("A1D09S7Q0OD6TH");
    expect(
      resolveSeller(
        "https://www.amazon.com/sp?ie=UTF8&seller=A02211013Q5HP3OMSZC7W&isAmazonFulfilled=1"
      )
    ).toBe("A02211013Q5HP3OMSZC7W");
    expect(
      resolveSeller(
        "https://www.amazon.com/s?me=A1OFNH7X27CXTU&marketplaceID=ATVPDKIKX0DER"
      )
    ).toBe("A1OFNH7X27CXTU");
    expect(resolveInfluencer("@tastemade")).toBe("tastemade");
    expect(
      resolveInfluencer("https://www.amazon.com/shop/tastemade?tag=x")
    ).toBe("tastemade");
    expect(
      resolvePost(
        "https://www.amazon.com/shop/tastemade/list/1N84PQ3CI4NW0?tag=x"
      )
    ).toEqual({ handle: "tastemade", id: "1N84PQ3CI4NW0" });
    expect(resolvePost("1N84PQ3CI4NW0")).toEqual({
      handle: null,
      id: "1N84PQ3CI4NW0"
    });
  });

  it("resolves node, bestseller category, and query", () => {
    expect(resolveNode("172282")).toBe("172282");
    expect(
      resolveNode(
        "https://www.amazon.com/s?k=laptop&i=computers&rh=n%3A172282%2Cn%3A541966&dc"
      )
    ).toBe("541966");
    expect(resolveNode("https://www.amazon.com/b?node=172282")).toBe("172282");
    expect(resolveBestsellerCategory("electronics")).toBe("electronics");
    expect(resolveBestsellerCategory("")).toBe("");
    expect(
      resolveBestsellerCategory(
        "https://www.amazon.com/Best-Sellers-Software-Business-Office/zgbs/software/229535/ref=zg_bs_nav"
      )
    ).toBe("software/229535");
    expect(
      resolveBestsellerCategory(
        "https://www.amazon.com/gp/new-releases/electronics/"
      )
    ).toBe("electronics");
    expect(
      resolveQuery(
        "https://www.amazon.co.uk/s?k=head+phones&i=electronics"
      )
    ).toBe("head phones");
    expect(
      countryOf("https://www.amazon.co.uk/dp/B0HGXMZ2SD")
    ).toBe("GB");
    expect(countryOf("B0HGXMZ2SD")).toBeNull();
    expect(pageType("https://www.amazon.com/dp/B00939I7EK")).toBe("product");
    expect(
      pageType("https://www.amazon.com/gp/bestsellers/software/")
    ).toBe("bestsellers");
    expect(pageType("https://www.amazon.com/s?k=laptop")).toBe("search");
  });
});
