import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { Box, Typography } from '@material-ui/core';
import type { ReportSummary } from '../api/RegisApi';
import { mix, missingCount, worstTier } from './rollup';
import { TierMixBar } from './TierMixBar';

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

  return (
    <Box mb={1.5}>
      <TierMixBar
        entries={entries}
        gridGap={14}
        trailing={
          <>
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
          </>
        }
      />
    </Box>
  );
}
