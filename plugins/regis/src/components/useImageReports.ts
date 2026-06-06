import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import type { PlaybookLadder, TrendBand } from '@regis/backstage-plugin-regis-common';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { unionLadder } from './format';

/**
 * Loads the catalog-wide report summaries and the published playbook ladders,
 * then narrows the summaries to the given image entityRefs. Shared by every
 * image-posture surface (service card, playbook scorecard, playbook table).
 */
export function useImageReports(imageRefs: string[]): {
  rows: ReportSummary[];
  ladder: TrendBand[];
  playbooks: PlaybookLadder[] | undefined;
  loading: boolean;
  error: Error | undefined;
} {
  const api = useApi(regisApiRef);
  // listReports()/getPlaybooks() are catalog-wide, so the fetch is intentionally
  // fire-once per mount; narrowing to imageRefs happens below on every render.
  const { value, loading, error } = useAsync(
    () => Promise.all([api.listReports(), api.getPlaybooks()]),
    [],
  );
  const [reports, playbooksResp] = value ?? [undefined, undefined];
  const ladder = unionLadder(playbooksResp?.playbooks);
  const wanted = new Set(imageRefs);
  const rows = (reports ?? []).filter(r => wanted.has(r.entityRef));
  return { rows, ladder, playbooks: playbooksResp?.playbooks, loading, error };
}
