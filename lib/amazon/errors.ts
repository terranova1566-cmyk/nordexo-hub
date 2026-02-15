import type { AmazonProvider } from "@/lib/amazon/types";

export class AmazonScrapeError extends Error {
  public readonly code: string;
  public readonly provider: AmazonProvider;
  public readonly url?: string;
  public readonly detail?: unknown;

  constructor(args: {
    code: string;
    message: string;
    provider: AmazonProvider;
    url?: string;
    detail?: unknown;
  }) {
    super(args.message);
    this.name = "AmazonScrapeError";
    this.code = args.code;
    this.provider = args.provider;
    this.url = args.url;
    this.detail = args.detail;
  }
}

