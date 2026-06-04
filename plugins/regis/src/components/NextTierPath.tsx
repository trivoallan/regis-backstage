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

  // Purely actionable: render only when there are concrete rules to fix. We
  // never assert a "top tier" state, because the per-image ladder ordering is
  // not reliable here — reports carry no playbook and the resolved ladder may
  // be a cross-playbook / discovery-ranked union. Failing rules are the only
  // trustworthy signal, so the card appears iff there are blocking rules.
  const next = nextTier(ladder, tier);
  const blocking = next ? blockingRules(rules, next) : [];
  if (blocking.length === 0) return null;

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
