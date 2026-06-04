import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { InfoCard, StatusError, StatusWarning } from '@backstage/core-components';
import { List, ListItem, ListItemIcon, ListItemText } from '@material-ui/core';
import { blockingRules, nextTier, type Rule } from './posture';

/** Actionable "what blocks the next tier" checklist, or a top-tier state. */
export function NextTierPath(props: {
  rules: Rule[];
  tier: string | null | undefined;
  ladder: TrendBand[];
}) {
  const { rules, tier, ladder } = props;
  if (ladder.length === 0) return null;

  const next = nextTier(ladder, tier);
  if (!next) {
    return <InfoCard title="Top tier — posture maintained" />;
  }

  const blocking = blockingRules(rules, next);
  return (
    <InfoCard title={`Path to ${next}`}>
      <List dense>
        {blocking.map(r => (
          <ListItem key={r.slug}>
            <ListItemIcon>
              {r.status === 'incomplete' ? <StatusWarning /> : <StatusError />}
            </ListItemIcon>
            <ListItemText
              primary={r.description}
              secondary={
                r.status === 'incomplete' ? `To investigate — ${r.message}` : r.message
              }
            />
          </ListItem>
        ))}
      </List>
    </InfoCard>
  );
}
