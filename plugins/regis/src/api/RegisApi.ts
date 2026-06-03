import { createApiRef } from '@backstage/frontend-plugin-api';
import type {
  ExploreGroupBy,
  ExploreResponse,
  PlaybooksResponse,
  PortfolioTrend,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
} from '@regis/backstage-plugin-regis-common';

export type {
  ExploreGroupBy,
  ExploreResponse,
  PlaybooksResponse,
  PortfolioTrend,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
};

export interface ExploreParams {
  groupBy: ExploreGroupBy;
  days?: number;
  system?: string;
  owner?: string;
  playbook?: string;
  tier?: string;
}

export interface RegisApi {
  getReport(entityRef: string): Promise<ReportEnvelope>;
  listReports(): Promise<ReportSummary[]>;
  getHistory(entityRef: string): Promise<ReportHistory>;
  getPortfolioTrend(
    days: number,
    filters?: { system?: string; owner?: string; playbook?: string },
  ): Promise<PortfolioTrend>;
  getPlaybooks(): Promise<PlaybooksResponse>;
  explore(params: ExploreParams): Promise<ExploreResponse>;
}

export const regisApiRef = createApiRef<RegisApi>({
  id: 'plugin.regis.service',
});
