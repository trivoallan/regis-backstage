import { createApiRef } from '@backstage/frontend-plugin-api';
import type {
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
} from '@regis/backstage-plugin-regis-common';

export type { ReportEnvelope, ReportHistory, ReportSummary };

export interface RegisApi {
  getReport(entityRef: string): Promise<ReportEnvelope>;
  listReports(): Promise<ReportSummary[]>;
  getHistory(entityRef: string): Promise<ReportHistory>;
}

export const regisApiRef = createApiRef<RegisApi>({
  id: 'plugin.regis.service',
});
