import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Chip, Typography } from '@material-ui/core';
import { regisApiRef } from '../api/RegisApi';
import { tierColor, unionLadder } from './format';

/** Compact Overview card: tier badge + score + pass/fail counts. */
export function RegisScorecardCard() {
  const api = useApi(regisApiRef);
  const { entity } = useEntity();
  const ref = stringifyEntityRef(entity);

  const { value, loading, error } = useAsync(
    () => Promise.all([api.getReport(ref), api.getPlaybooks()]),
    [ref],
  );

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const [envelope, playbooksResp] = value!;
  const report = envelope.report;
  const ladder = unionLadder(playbooksResp.playbooks);
  const score = report.rules_summary?.score;
  const total = report.rules_summary?.total?.length ?? 0;
  const passed = report.rules_summary?.passed?.length ?? 0;

  return (
    <InfoCard title="Regis posture">
      {report.tier && (
        <Chip
          label={report.tier}
          style={{ backgroundColor: tierColor(report.tier, ladder), color: '#fff' }}
        />
      )}
      {score !== undefined && (
        <Typography variant="h4">{score}/100</Typography>
      )}
      <Typography variant="body2">
        {passed}/{total} rules passed
      </Typography>
    </InfoCard>
  );
}
