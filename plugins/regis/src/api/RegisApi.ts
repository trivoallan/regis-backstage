import { createApiRef } from '@backstage/frontend-plugin-api';
import type {
  ReportEnvelope,
  ReportSummary,
} from '@regis/backstage-plugin-regis-common';

export type { ReportEnvelope, ReportSummary };

export interface RegisApi {
  getReport(entityRef: string): Promise<ReportEnvelope>;
  listReports(): Promise<ReportSummary[]>;
}

export const regisApiRef = createApiRef<RegisApi>({
  id: 'plugin.regis.service',
});
