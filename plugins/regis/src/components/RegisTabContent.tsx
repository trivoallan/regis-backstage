import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  Content,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Box } from '@material-ui/core';
import { regisApiRef } from '../api/RegisApi';
import { unionLadder } from './format';
import { PostureSummary } from './PostureSummary';
import { NextTierPath } from './NextTierPath';
import { RuleTable } from './RuleTable';

/** Full Regis report tab: posture summary → promotion path → rule table. */
export function RegisTabContent() {
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
  const rules = report.rules ?? [];

  return (
    <Content>
      <Box display="flex" flexDirection="column" gridGap={16}>
        <PostureSummary report={report} ladder={ladder} />
        <NextTierPath rules={rules} tier={report.tier} ladder={ladder} />
        <RuleTable rules={rules} rulesSummary={report.rules_summary} />
      </Box>
    </Content>
  );
}
