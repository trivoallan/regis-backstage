import { createApiRef } from '@backstage/frontend-plugin-api';
import type {
  PortfolioTrend,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
} from '@regis/backstage-plugin-regis-common';

export type { PortfolioTrend, ReportEnvelope, ReportHistory, ReportSummary };

export interface RegisApi {
  getReport(entityRef: string): Promise<ReportEnvelope>;
  listReports(): Promise<ReportSummary[]>;
  getHistory(entityRef: string): Promise<ReportHistory>;
  getPortfolioTrend(days: number): Promise<PortfolioTrend>;
}

export const regisApiRef = createApiRef<RegisApi>({
  id: 'plugin.regis.service',
});
