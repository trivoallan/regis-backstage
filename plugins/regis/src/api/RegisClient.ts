import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type {
  ExploreParams,
  ExploreResponse,
  PlaybooksResponse,
  PortfolioTrend,
  RegisApi,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
} from './RegisApi';

export class RegisClient implements RegisApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('regis');
  }

  private getJson<T>(path: string): Promise<T> {
    const cached = this.inflight.get(path);
    if (cached) return cached as Promise<T>;
    const promise = this.fetchJson<T>(path);
    this.inflight.set(path, promise);
    const clear = () => this.inflight.delete(path);
    promise.then(clear, clear);
    return promise;
  }

  private async fetchJson<T>(path: string): Promise<T> {
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
    filters: { system?: string; owner?: string; playbook?: string } = {},
  ): Promise<PortfolioTrend> {
    const params = new URLSearchParams({ days: String(days) });
    if (filters.system) params.set('system', filters.system);
    if (filters.owner) params.set('owner', filters.owner);
    if (filters.playbook) params.set('playbook', filters.playbook);
    return this.getJson<PortfolioTrend>(`/portfolio/trend?${params.toString()}`);
  }

  async getPlaybooks(): Promise<PlaybooksResponse> {
    return this.getJson<PlaybooksResponse>('/playbooks');
  }

  async explore(params: ExploreParams): Promise<ExploreResponse> {
    const p = new URLSearchParams({ groupBy: params.groupBy });
    if (params.days) p.set('days', String(params.days));
    if (params.system) p.set('system', params.system);
    if (params.owner) p.set('owner', params.owner);
    if (params.playbook) p.set('playbook', params.playbook);
    if (params.tier) p.set('tier', params.tier);
    return this.getJson<ExploreResponse>(`/portfolio/explore?${p.toString()}`);
  }
}
