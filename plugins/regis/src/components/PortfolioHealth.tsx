import { InfoCard } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';
import { WORST_TIER_COLOR } from './format';
import { formatDelta, summarizeTrend } from './trendSummary';
import { TierMixBar } from './TierMixBar';

function Kpi(props: { label: string; value: string; delta: string; days: number }) {
  return (
    <Box>
      <Typography variant="caption" color="textSecondary" component="div" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {props.label}
      </Typography>
      <Typography variant="h4" component="div">{props.value}</Typography>
      <Typography variant="caption" component="div">{`${props.delta} / ${props.days}d`}</Typography>
    </Box>
  );
}

/** Portfolio health header: tier-mix bar + worst tier + headline KPIs with deltas. */
export function PortfolioHealth(props: {
  bands: TrendBand[];
  buckets: TrendBucket[];
  days: number;
}) {
  const { bands, buckets, days } = props;
  if (buckets.length === 0) return null;

  const h = summarizeTrend(bands, buckets);

  return (
    <InfoCard title="Portfolio health">
      <Box display="flex" gridGap={24} alignItems="center" flexWrap="wrap">
        <Box flex="1 1 320px" minWidth={240}>
          <TierMixBar
            entries={h.mix}
            height={16}
            borderRadius={5}
            trailing={
              h.worst ? (
                <Typography
                  variant="caption"
                  component="span"
                  style={{ marginLeft: 'auto', fontWeight: 600, color: WORST_TIER_COLOR }}
                >
                  Worst: {h.worst.label} · {h.worst.count}
                </Typography>
              ) : undefined
            }
          />
        </Box>
        <Box display="flex" gridGap={24}>
          <Kpi label="Avg score" value={String(h.avgScore)} delta={formatDelta(h.scoreDelta)} days={days} />
          <Kpi label="Images" value={String(h.images)} delta={formatDelta(h.imagesDelta)} days={days} />
        </Box>
      </Box>
    </InfoCard>
  );
}
