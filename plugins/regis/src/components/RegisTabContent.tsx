import {
  Content,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { Box } from '@material-ui/core';
import { PostureSummary } from './PostureSummary';
import { RuleTable } from './RuleTable';
import { useReportAndLadder } from './useReportAndLadder';

/** Full Regis report tab: posture summary → promotion path → rule table. */
export function RegisTabContent() {
  const { value, loading, error } = useReportAndLadder();

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const { report, ladder } = value!;
  const rules = report.rules ?? [];

  return (
    <Content>
      <Box display="flex" flexDirection="column" gridGap={16}>
        <PostureSummary report={report} ladder={ladder} />
        <RuleTable rules={rules} rulesSummary={report.rules_summary} />
      </Box>
    </Content>
  );
}
