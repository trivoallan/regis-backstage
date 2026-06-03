import {
  validateReportIndex,
  type ReportIndex,
} from '@regis/backstage-plugin-regis-common';
import type { ReportSource } from './ReportSource';

/** Fetches the published index from `url` and validates it (shared trust boundary). */
export async function fetchIndex(
  source: ReportSource,
  url: string,
): Promise<ReportIndex> {
  const raw = await source.fetch(url);
  return validateReportIndex(raw);
}
