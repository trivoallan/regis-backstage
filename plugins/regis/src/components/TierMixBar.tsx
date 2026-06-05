import type { ReactNode } from 'react';
import { Box, Typography } from '@material-ui/core';
import type { MixEntry } from './rollup';

/** Shared tier-mix bar + legend. Consumers pass their own trailing indicator. */
export function TierMixBar(props: {
  entries: MixEntry[];
  ariaPrefix?: string;
  height?: number;
  borderRadius?: number;
  gridGap?: number;
  trailing?: ReactNode;
}) {
  const {
    entries,
    ariaPrefix = 'Tier distribution',
    height = 14,
    borderRadius = 4,
    gridGap = 12,
    trailing,
  } = props;
  const total = entries.reduce((n, e) => n + e.count, 0) || 1;
  const barLabel = `${ariaPrefix}: ${entries.map(e => `${e.count} ${e.label}`).join(', ')}`;
  return (
    <>
      <Box
        display="flex"
        height={height}
        borderRadius={borderRadius}
        overflow="hidden"
        mb={1}
        role="img"
        aria-label={barLabel}
      >
        {entries.map(e => (
          <Box
            key={e.key}
            height="100%"
            bgcolor={e.color}
            width={`${(e.count / total) * 100}%`}
            title={`${e.count} ${e.label}`}
          />
        ))}
      </Box>
      <Box display="flex" flexWrap="wrap" gridGap={gridGap} alignItems="center">
        {entries.map(e => (
          <Typography key={e.key} variant="body2" component="span">
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: 2,
                background: e.color,
                marginRight: 5,
              }}
            />
            {e.count} {e.label}
          </Typography>
        ))}
        {trailing}
      </Box>
    </>
  );
}
