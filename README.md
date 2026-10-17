# 🛒 Amazon Scraper for Cloudflare Workers

A high-performance port of [amazon-scraper](https://github.com/omkarcloud/amazon-scraper) to TypeScript / JavaScript running natively on **Cloudflare Workers** (V8 isolate edge runtime).

## ✨ Features

- ⚡ **Zero-Server Serverless**: Runs at the edge on Cloudflare Workers with minimal latency.
- 📦 **Dual Usage**: Use as a standalone Cloudflare Worker HTTP API or import functions directly into your Node.js / JavaScript / TypeScript projects.
- 🛍️ **Four Core Endpoints Implemented**:
  - `/products/details`: Comprehensive product data (price, buybox, stock, delivery, specs, images, videos, variants, AI review summaries, top reviews).
  - `/products/offers`: Full seller offers breakdown with prices, conditions, condition notes, delivery, seller ratings, and pagination.
  - `/sellers/details`: Seller profile, storefront links, ratings breakdown (lifetime, 12m, 3m, 1m), business address, and about info.
  - `/search`: Search Amazon by keyword, browse node, or category, with filters for Prime, condition, ratings, deals, and min/max prices.
- 🌍 **23 Amazon Marketplaces**: Supports US, CA, MX, BR, GB, IE, DE, FR, IT, ES, NL, BE, SE, PL, TR, AE, SA, EG, IN, JP, SG, AU, ZA.
- 🔗 **Smart Reference Parsing**: Pass ASINs or URLs, seller IDs or URLs, search keywords or search URLs; automatically detects marketplace country from links.
- 🛡️ **Anti-Bot & Local Delivery Support**: Warm sessions, glow address delivery updates (local zip code), and Akamai Proof-of-Work interstitial solving.
- 🚀 **100% Parser Parity Tested**: Verified offline against captured fixture pages (`dp_*.html.gz`, `aod_*.html.gz`, `seller_*.html.gz`, `search_*.html.gz`).

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Tests

Verify offline parser parity across all 4 endpoints:

```bash
npm test
```

### 3. Local Development

Start the Cloudflare Workers dev server:

```bash
npm run dev
```

Visit:
- `http://localhost:8787/health`
- `http://localhost:8787/products/details?product=B07QSFHT27`
- `http://localhost:8787/products/offers?product=B00939I7EK`
- `http://localhost:8787/sellers/details?seller=A1D09S7Q0OD6TH`
- `http://localhost:8787/search?query=laptop`

### 4. Deploy to Cloudflare Workers

```bash
npm run deploy
```

---

## 💻 Library Usage (Direct Functions)

You can import and call the scraper functions directly in your own code:

```typescript
import {
  getProductDetails,
  getProductOffers,
  getSellerDetails,
  searchProducts
} from "amazon-scraper-cloudflare";

// 1. Get Product Details
const product = await getProductDetails({
  product: "B07QSFHT27", // or full Amazon URL
  country: "US"
});
console.log(product.title, product.price?.amount);

// 2. Get Product Offers
const offers = await getProductOffers({
  product: "B00939I7EK",
  page: 1,
  condition: "all"
});
console.log(offers.offers);

// 3. Get Seller Details
const seller = await getSellerDetails({
  seller: "A1D09S7Q0OD6TH"
});
console.log(seller.name, seller.rating.positive_percent);

// 4. Search Products
const results = await searchProducts({
  query: "laptop",
  min_price: 300,
  max_price: 800,
  is_prime: true
});
console.log(results.results);
```

---

## ⚙️ Configuration & Proxies

Amazon actively protects its storefronts from bot traffic. Cloudflare Workers egress IPs originate from datacenter ASNs. To avoid CAPTCHAs and 503 blocks in production, configure an upstream residential proxy:

In `wrangler.jsonc` or Cloudflare Worker environment variables:
```jsonc
{
  "vars": {
    "AMAZON_PROXY": "http://user:pass@proxy-host:port"
  }
}
```

Or set `AMAZON_PROXY` via `wrangler secret put AMAZON_PROXY`.
