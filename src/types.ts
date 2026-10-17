export interface SiteConfig {
  domain: string;
  marketplace_id: string;
  language: string;
  currency: string;
  fingerprint: string;
  postal_code: string | null;
  exit_country: string | null;
  country: string;
  host: string;
  base: string;
  data_host: string;
  completion_host: string;
}

export interface Money {
  amount: number | null;
  currency: string;
  list_price?: number | null;
  list_price_type?: string | null;
  savings_percent?: number | null;
}

export interface Rating {
  average: number | null;
  count: number | null;
  histogram?: Record<string, number> | null;
}

export interface BuyboxSeller {
  name: string | null;
  id: string | null;
  link: string | null;
}

export interface Buybox {
  seller: BuyboxSeller | null;
  ships_from: string | null;
  is_fulfilled_by_amazon: boolean;
  is_sold_by_amazon: boolean;
}

export interface Delivery {
  text: string | null;
  fastest_text?: string | null;
  location?: string | null;
}

export interface ProductDetails {
  asin: string;
  title: string | null;
  link: string;
  brand: {
    name: string | null;
    byline?: string | null;
    link: string | null;
    store_link: string | null;
  } | null;
  authors: Array<{ name: string; role?: string | null; link?: string | null }> | null;
  price: Money | null;
  deal_badge: string | null;
  coupon: string | null;
  availability: {
    text: string | null;
    is_in_stock: boolean;
    quantity_left: number | null;
  };
  buybox: Buybox | null;
  delivery: Delivery | null;
  is_prime: boolean;
  rating: Rating | null;
  bought_past_month: number | null;
  badges: {
    is_best_seller: boolean;
    is_amazons_choice: boolean;
    best_seller_text: string | null;
    is_climate_pledge_friendly: boolean;
  };
  categories: Array<{ name: string; link: string | null; node_id: string | null }>;
  best_sellers_rank: Array<{
    rank: number;
    category: string;
    link: string | null;
    category_id?: string | null;
  }>;
  bullets: string[];
  overview: Record<string, string> | null;
  description: string | null;
  aplus_description: string | null;
  details: Record<string, any> | null;
  identifiers: Record<string, string> | null;
  images: Array<{ link: string; variant?: string; hi_res?: string | null }>;
  videos: Array<{ link: string; title?: string | null; duration_seconds?: number | null }>;
  videos_count: number | null;
  variations: {
    parent_asin: string | null;
    current_asin: string | null;
    dimensions: Array<{ name: string; values?: string[] }>;
    products: Array<{ asin: string; attributes: Record<string, string> }>;
    count: number;
  } | null;
  customers_say: {
    summary: string | null;
    aspects: Array<{
      name: string;
      sentiment: string;
      mentions?: number | null;
      mentions_percentage?: number | null;
    }>;
  } | null;
  top_reviews: Array<{
    id: string;
    title: string | null;
    rating: number | null;
    date: string | null;
    country: string | null;
    is_verified_purchase: boolean;
    helpful_votes: number | null;
    author: { name: string | null; link: string | null };
    text: string | null;
    images?: string[];
  }>;
  has_inline_reviews: boolean;
  important_information: string | null;
  warranty: string | null;
  country: string;
  domain: string;
}

export interface OfferItem {
  condition: string | null;
  condition_note: string | null;
  price: Money | null;
  seller: {
    name: string | null;
    id: string | null;
    link: string | null;
    rating: number | null;
    positive_percent: number | null;
    ratings_count: number | null;
  } | null;
  ships_from: string | null;
  is_fulfilled_by_amazon: boolean;
  is_sold_by_amazon: boolean;
  is_prime: boolean;
  delivery: {
    text: string | null;
    fastest_text: string | null;
  } | null;
  max_quantity: number | null;
  promotion: string | null;
  is_pinned: boolean;
}

export interface OffersResult {
  asin: string;
  title: string | null;
  rating: Rating | null;
  offers: OfferItem[];
  other_offers_count: number | null;
  has_more: boolean;
  condition?: string;
  country: string;
  domain: string;
  pagination?: Pagination;
}

export interface SellerDetails {
  id: string | null;
  name: string | null;
  link: string | null;
  storefront_link: string | null;
  logo: string | null;
  rating: {
    average: number | null;
    positive_percent: number | null;
    count: number | null;
  };
  ratings: {
    lifetime: SellerRatingPeriod | null;
    twelve_months: SellerRatingPeriod | null;
    three_months: SellerRatingPeriod | null;
    one_month: SellerRatingPeriod | null;
  };
  business: {
    name: string | null;
    address: string | null;
  };
  about: string | null;
  info: Record<string, string> | null;
  country: string;
  domain: string;
}

export interface SellerRatingPeriod {
  count: number | null;
  positive_percent: number | null;
  stars: Record<string, number | null>;
  stars_percent: Record<string, number | null>;
}

export interface SearchCard {
  asin: string;
  title: string | null;
  brand: string | null;
  link: string;
  image: string | null;
  thumbnail: string | null;
  is_sponsored: boolean;
  price: Money | null;
  rating: {
    average: number | null;
    count: number | null;
  } | null;
  bought_past_month: number | null;
  bought_past_month_text: string | null;
  badges: Record<string, boolean>;
  delivery: string | null;
  coupon: string | null;
  variations_text: string | null;
  has_variations: boolean;
  more_buying_choices: {
    lowest_price: number | null;
    offers_count: number | null;
    text: string | null;
  } | null;
  position: number | null;
}

export interface SearchFacetOption {
  name: string;
  value: string | null;
  link: string | null;
  is_selected: boolean;
}

export interface SearchFacet {
  id: string | null;
  name: string | null;
  options: SearchFacetOption[];
}

export interface SearchDepartment {
  name: string;
  node_id: string | null;
  link: string | null;
  is_selected: boolean;
}

export interface SearchPageResult {
  results: SearchCard[];
  total_count: number | null;
  is_total_approximate: boolean;
  results_text: string | null;
  departments: SearchDepartment[];
  refinements: SearchFacet[];
  search_aliases?: Array<{ id: string; name: string }>;
  current_page: number;
  total_pages: number;
  applied_refinements?: string[] | null;
  pagination?: Pagination;
  query?: string;
  country?: string;
  domain?: string;
}

export interface Pagination {
  page: number;
  items_per_page: number;
  total_pages: number;
  total_count: number | null;
}

export interface PagedEnvelope<T> {
  count?: number | null;
  per_page?: number;
  current_page?: number;
  total_pages?: number;
  next?: string | null;
  previous?: string | null;
  [key: string]: any;
}

// Error classes
export class AmazonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmazonError";
  }
}

export class AmazonNotFoundError extends AmazonError {
  constructor(message: string = "not found") {
    super(message);
    this.name = "AmazonNotFoundError";
  }
}

export class AmazonBlockedError extends AmazonError {
  constructor(message: string) {
    super(message);
    this.name = "AmazonBlockedError";
  }
}

export class AmazonBadRequestError extends AmazonError {
  constructor(message: string) {
    super(message);
    this.name = "AmazonBadRequestError";
  }
}

export class AmazonUpstreamError extends AmazonError {
  constructor(message: string) {
    super(message);
    this.name = "AmazonUpstreamError";
  }
}
