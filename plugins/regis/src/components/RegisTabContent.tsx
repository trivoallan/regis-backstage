import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  Content,
  InfoCard,
  Progress,
  ResponseErrorPanel,
  StatusError,
  StatusOK,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@material-ui/core';
import type { Report } from '@regis/backstage-plugin-regis-common';
import { regisApiRef } from '../api/RegisApi';

type Rule = NonNullable<Report['rules']>[number];

function groupByTag(rules: Rule[]): Record<string, Rule[]> {
  const groups: Record<string, Rule[]> = {};
  for (const rule of rules) {
    for (const tag of rule.tags ?? ['untagged']) {
      (groups[tag] ??= []).push(rule);
    }
  }
  return groups;
}

/** Full report tab: header + rules grouped by tag. */
export function RegisTabContent() {
  const api = useApi(regisApiRef);
  const { entity } = useEntity();
  const ref = stringifyEntityRef(entity);
  const { value, loading, error } = useAsync(() => api.getReport(ref), [ref]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const report = value!.report;
  const groups = groupByTag(report.rules ?? []);

  return (
    <Content>
      <Typography variant="h5">
        {report.request.repository}:{report.request.tag}
        {report.tier ? ` — ${report.tier}` : ''}
      </Typography>
      {Object.entries(groups).map(([tag, rules]) => (
        <InfoCard key={tag} title={tag}>
          <List dense>
            {rules.map(rule => (
              <ListItem key={rule.slug}>
                <ListItemIcon>
                  {rule.passed ? <StatusOK /> : <StatusError />}
                </ListItemIcon>
                <ListItemText
                  primary={rule.description}
                  secondary={rule.message}
                />
              </ListItem>
            ))}
          </List>
        </InfoCard>
      ))}
    </Content>
  );
}
