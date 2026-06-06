import { Box, Chip } from '@material-ui/core';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';

/** A playbook's tier ladder rendered best→worst as colored chips. */
export function TierLadder(props: { tiers: TrendBand[] }) {
  if (props.tiers.length === 0) return null;
  return (
    <Box display="flex" flexWrap="wrap" alignItems="center" gridGap={6}>
      {props.tiers.map(t => (
        <Chip
          key={t.key}
          size="small"
          label={t.label}
          style={{ backgroundColor: t.color, color: '#fff' }}
        />
      ))}
    </Box>
  );
}
