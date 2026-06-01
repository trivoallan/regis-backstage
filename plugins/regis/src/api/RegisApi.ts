import { createApiRef } from '@backstage/frontend-plugin-api';
import type { Report } from '@regis/backstage-plugin-regis-common';

export interface ReportEnvelope {
  report: Report;
  meta: { fetchedAt: string; source: string; schemaVersion: number };
}

export interface ReportSummary {
  entityRef: string;
  status: 'ok' | 'error' | 'pending';
  tier?: string | null;
  score?: number;
  byTag?: Record<string, number>;
  error?: string;
}

export interface RegisApi {
  getReport(entityRef: string): Promise<ReportEnvelope>;
  listReports(): Promise<ReportSummary[]>;
}

export const regisApiRef = createApiRef<RegisApi>({
  id: 'plugin.regis.service',
});
