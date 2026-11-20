/**
 * The price list, as data.
 *
 * A tariff is not a constant in a formula: it is a document with a source and
 * the date somebody read that source. When AWS changes a price, one file changes
 * and every record that quoted the old one is rebuilt. A price typed into the
 * prose is a number with no record, and this book does not print those.
 */

export type TariffSource = {
  /** The page the numbers were read from. */
  readonly url: string;
  /** The day they were read, ISO 8601. */
  readonly readOn: string;
  /** What exactly was read there, so the next reader can find it again. */
  readonly note: string;
};

export type Tariff = {
  readonly id: string;
  readonly currency: "USD";
  readonly source: TariffSource;
  /** Per million invocations. */
  readonly requestUsdPerMillion: number;
  /** Per GB-second of execution, x86, first tier. */
  readonly computeUsdPerGbSecond: number;
  /** Per GB leaving the provider, first 10 TB. */
  readonly egressUsdPerGb: number;
  /** Per GB-month stored. */
  readonly storageUsdPerGbMonth: number;
};

/** Decimal units, because that is how the bill counts. */
export const BYTES = { KB: 1e3, MB: 1e6, GB: 1e9 } as const;

export const TARIFF_2026_11: Tariff = {
  id: "aws-us-east-1-2026-11",
  currency: "USD",
  source: {
    url: "https://aws.amazon.com/lambda/pricing/",
    readOn: "2026-11-20",
    note:
      "Lambda Event Functions, x86, first tier: $0.20 per 1M requests and " +
      "$0.0000166667 per GB-second. S3 Standard $0.023 per GB-month and " +
      "$0.09 per GB of data transfer out to the internet, first 10 TB, " +
      "us-east-1, read from https://aws.amazon.com/s3/pricing/ the same day.",
  },
  requestUsdPerMillion: 0.2,
  computeUsdPerGbSecond: 0.0000166667,
  egressUsdPerGb: 0.09,
  storageUsdPerGbMonth: 0.023,
};

/**
 * A tariff with no source is a rumour. Every price in the book goes through
 * this before it is used, so a hand-edited number cannot reach a transcript.
 */
export function assertTariffIsSourced(tariff: Tariff): void {
  const { url, readOn, note } = tariff.source;
  if (!/^https:\/\//.test(url)) {
    throw new Error(`tariff ${tariff.id}: source.url is not an https URL: ${url}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readOn)) {
    throw new Error(`tariff ${tariff.id}: source.readOn is not an ISO date: ${readOn}`);
  }
  if (note.trim().length < 40) {
    throw new Error(`tariff ${tariff.id}: source.note does not say what was read`);
  }
}

/** Requests are billed per million, and never rounded up per call. */
export function priceRequest(tariff: Tariff, count: number): number {
  return (count / 1e6) * tariff.requestUsdPerMillion;
}

/** GB-seconds, not seconds: the bill multiplies by the memory you asked for. */
export function priceCompute(tariff: Tariff, gbSeconds: number): number {
  return gbSeconds * tariff.computeUsdPerGbSecond;
}

/** Egress is billed on the bytes that leave, in decimal GB. */
export function priceEgress(tariff: Tariff, bytes: number): number {
  return (bytes / BYTES.GB) * tariff.egressUsdPerGb;
}

export function priceStorage(tariff: Tariff, gbMonths: number): number {
  return gbMonths * tariff.storageUsdPerGbMonth;
}
