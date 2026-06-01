/** Fetches the raw (unvalidated) report JSON for a given URL. */
export interface ReportSource {
  fetch(url: string): Promise<unknown>;
}

/** Thrown when a report URL cannot be retrieved. */
export class ReportFetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly status?: number,
    cause?: unknown,
  ) {
    const detail = status ? ` (HTTP ${status})` : `: ${String(cause)}`;
    super(`failed to fetch report from ${url}${detail}`);
    this.name = 'ReportFetchError';
  }
}

/** Server-side HTTP fetch — solves CORS and centralises retries/timeouts. */
export class HttpReportSource implements ReportSource {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetch(url: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { redirect: 'follow' });
    } catch (err) {
      throw new ReportFetchError(url, undefined, err);
    }
    if (!res.ok) {
      throw new ReportFetchError(url, res.status);
    }
    return res.json();
  }
}
