import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type { Report, TrendBand } from '@regis/backstage-plugin-regis-common';
import { regisApiRef } from '../api/RegisApi';
import { unionLadder } from './format';

export interface ReportAndLadder {
  report: Report;
  ladder: TrendBand[];
}

/**
 * Fetches the current entity's Regis report together with the flattened tier
 * ladder. Shared by the overview scorecard and the Regis tab so both derive the
 * same shape from one place.
 */
export function useReportAndLadder(): {
  value: ReportAndLadder | undefined;
  loading: boolean;
  error: Error | undefined;
} {
  const api = useApi(regisApiRef);
  const { entity } = useEntity();
  const ref = stringifyEntityRef(entity);
  const { value, loading, error } = useAsync(
    () => Promise.all([api.getReport(ref), api.getPlaybooks()]),
    [ref],
  );
  const mapped = value
    ? { report: value[0].report, ladder: unionLadder(value[1].playbooks) }
    : undefined;
  return { value: mapped, loading, error };
}
