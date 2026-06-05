import {
  Content,
  Link,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Box } from '@material-ui/core';
import { REGIS_ANNOTATION_PLAYBOOK } from '@regis/backstage-plugin-regis-common';
import { PostureSummary } from './PostureSummary';
import { RuleTable } from './RuleTable';
import { useReportAndLadder } from './useReportAndLadder';

/** Full Regis report tab: posture summary → rule table, with navigation links. */
export function RegisTabContent() {
  const { entity } = useEntity();
  const { value, loading, error } = useReportAndLadder();

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const { report, ladder } = value!;
  const rules = report.rules ?? [];
  const playbookRef = entity.metadata.annotations?.[REGIS_ANNOTATION_PLAYBOOK];
  const playbookName = report.playbooks?.[0]?.playbook_name;
  const exploreHref = playbookName
    ? `/?groupBy=playbook&playbook=${encodeURIComponent(playbookName)}`
    : undefined;

  return (
    <Content>
      <Box display="flex" flexDirection="column" gridGap={16}>
        {exploreHref && (
          <Box>
            <Link to={exploreHref}>View in explorer</Link>
          </Box>
        )}
        <PostureSummary report={report} ladder={ladder} playbookRef={playbookRef} />
        <RuleTable rules={rules} rulesSummary={report.rules_summary} />
      </Box>
    </Content>
  );
}
