import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type { PortfolioTrend, RegisApi, ReportEnvelope, ReportHistory, ReportSummary } from './RegisApi';

export class RegisClient implements RegisApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('regis');
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.fetchApi.fetch(`${await this.baseUrl()}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        `Regis request failed (${res.status}): ${
          (body as { error?: string }).error ?? res.statusText
        }`,
      );
    }
    return res.json() as Promise<T>;
  }

  async getReport(entityRef: string): Promise<ReportEnvelope> {
    return this.getJson<ReportEnvelope>(
      `/report?entityRef=${encodeURIComponent(entityRef)}`,
    );
  }

  async listReports(): Promise<ReportSummary[]> {
    return this.getJson<ReportSummary[]>('/reports');
  }

  async getHistory(entityRef: string): Promise<ReportHistory> {
    return this.getJson<ReportHistory>(
      `/report/history?entityRef=${encodeURIComponent(entityRef)}`,
    );
  }

  async getPortfolioTrend(
    days: number,
    filters: { system?: string; owner?: string } = {},
  ): Promise<PortfolioTrend> {
    const params = new URLSearchParams({ days: String(days) });
    if (filters.system) params.set('system', filters.system);
    if (filters.owner) params.set('owner', filters.owner);
    return this.getJson<PortfolioTrend>(`/portfolio/trend?${params.toString()}`);
  }
}
