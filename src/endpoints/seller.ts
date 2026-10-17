import { resolveSeller, countryOf } from "../refs";
import { parseSellerPage } from "../parsers/seller";
import { AmazonFetcher, defaultFetcher } from "../fetcher";
import { context } from "../shared";
import { SellerDetails, AmazonNotFoundError } from "../types";

export interface SellerDetailsParams {
  seller: string;
  country?: string | null;
  language?: string | null;
  fetcher?: AmazonFetcher;
}

export async function getSellerDetails(params: SellerDetailsParams): Promise<SellerDetails> {
  const fetcher = params.fetcher || defaultFetcher;
  const inferredCountry = params.country || countryOf(params.seller);
  const sellerId = resolveSeller(params.seller);
  const { site, locale } = context(inferredCountry, params.language);

  const html = await fetcher.getPage(site.country, "/sp", {
    params: { seller: sellerId },
    language: locale
  });

  const data = parseSellerPage(html, site);
  if (!data.name) {
    throw new AmazonNotFoundError(`seller ${sellerId}: no profile page`);
  }
  data.id = data.id || sellerId;
  return data;
}
