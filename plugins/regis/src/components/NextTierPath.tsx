import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import {
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
} from '@material-ui/core';
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
    return (
      <Card>
        <CardHeader title="Top tier — posture maintained" />
      </Card>
    );
  }

  const blocking = blockingRules(rules, next);
  return (
    <Card>
      <CardHeader title={`Path to ${next}`} />
      <CardContent>
        <List dense>
          {blocking.map(r => (
            <ListItem key={r.slug}>
              <ListItemText
                primary={r.description}
                secondary={
                  r.status === 'incomplete' ? `To investigate — ${r.message}` : r.message
                }
              />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
