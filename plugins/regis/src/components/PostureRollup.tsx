import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { Box, Typography } from '@material-ui/core';
import type { ReportSummary } from '../api/RegisApi';
import { mix, missingCount, worstTier } from './rollup';

/** Roll-up header: tier-mix bar + counts + worst tier + no-report count. */
export function PostureRollup(props: {
  rows: ReportSummary[];
  ladder: TrendBand[];
}) {
  const { rows, ladder } = props;
  if (rows.length === 0) return null;

  const entries = mix(rows, ladder);
  const worst = worstTier(rows, ladder);
  const missing = missingCount(rows);
  const total = rows.length;

  const barLabel = `Tier distribution: ${entries.map(e => `${e.count} ${e.label}`).join(', ')}`;

  return (
    <Box mb={1.5}>
      <Box display="flex" height={14} borderRadius={4} overflow="hidden" mb={1} role="img" aria-label={barLabel}>
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
      <Box display="flex" flexWrap="wrap" gridGap={14} alignItems="center">
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
        {worst && (
          <Typography
            variant="caption"
            component="span"
            style={{ marginLeft: 'auto', fontWeight: 600 }}
          >
            Worst: {worst.label} · {worst.count}
          </Typography>
        )}
        {missing > 0 && (
          <Typography variant="caption" component="span" color="textSecondary">
            {missing} no report
          </Typography>
        )}
      </Box>
    </Box>
  );
}
