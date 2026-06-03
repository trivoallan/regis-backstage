import Box from '@material-ui/core/Box';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Typography from '@material-ui/core/Typography';
import type { ExploreGroup, TrendBand } from '@regis/backstage-plugin-regis-common';
import { tierColor } from './format';

function MixBar({ tiers, ladder }: { tiers: Record<string, number>; ladder: TrendBand[] }) {
  const total = Object.values(tiers).reduce((a, n) => a + n, 0) || 1;
  return (
    <Box display="flex" width={90} height={8} borderRadius={2} overflow="hidden">
      {Object.entries(tiers).map(([tier, n]) => (
        <Box key={tier} width={`${(n / total) * 100}%`} style={{ backgroundColor: tierColor(tier, ladder) }} />
      ))}
    </Box>
  );
}

/** Per-group breakdown for the current group-by; each row drills (adds the group as a filter). */
export function Breakdown({
  groups,
  ladder,
  onDrill,
}: {
  groups: ExploreGroup[];
  ladder: TrendBand[];
  onDrill: (key: string) => void;
}) {
  if (groups.length === 0) {
    return <Typography variant="body2" color="textSecondary">No groups in scope.</Typography>;
  }
  return (
    <List dense>
      {groups.map(g => (
        <ListItem key={g.key} button onClick={() => onDrill(g.key)} aria-label={`drill into ${g.key}`}>
          <Box display="flex" alignItems="center" gridGap={12} width="100%">
            <Typography variant="body2" style={{ flex: 1 }}>{g.key}</Typography>
            <MixBar tiers={g.tiers} ladder={ladder} />
            <Typography variant="caption" color="textSecondary">{g.count} img</Typography>
            <Typography variant="body2">{g.avgScore}</Typography>
          </Box>
        </ListItem>
      ))}
    </List>
  );
}
