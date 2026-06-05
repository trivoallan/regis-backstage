import { Link, Progress, ResponseErrorPanel } from '@backstage/core-components';
import { Box } from '@material-ui/core';
import { RuleTable } from './RuleTable';
import { useReportAndLadder } from './useReportAndLadder';

/** Full-width Regis rule table with a link into the portfolio explorer. */
export function RegisRulesCard() {
  const { value, loading, error } = useReportAndLadder();

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const { report } = value!;
  const rules = report.rules ?? [];
  const playbookName = report.playbooks?.[0]?.playbook_name;
  const exploreHref = playbookName
    ? `/?groupBy=playbook&playbook=${encodeURIComponent(playbookName)}`
    : undefined;

  return (
    <Box display="flex" flexDirection="column" gridGap={16}>
      {exploreHref && (
        <Box>
          <Link to={exploreHref}>View in explorer</Link>
        </Box>
      )}
      <RuleTable rules={rules} rulesSummary={report.rules_summary} />
    </Box>
  );
}
