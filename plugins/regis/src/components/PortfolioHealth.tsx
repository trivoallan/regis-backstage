import { InfoCard } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';
import { formatDelta, summarizeTrend } from './trendSummary';

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
  const total = h.mix.reduce((n, e) => n + e.count, 0) || 1;
  const barLabel = `Tier distribution: ${h.mix.map(e => `${e.count} ${e.label}`).join(', ')}`;

  return (
    <InfoCard title="Portfolio health">
      <Box display="flex" gridGap={24} alignItems="center" flexWrap="wrap">
        <Box flex="1 1 320px" minWidth={240}>
          <Box
            display="flex"
            height={16}
            borderRadius={5}
            overflow="hidden"
            mb={1}
            role="img"
            aria-label={barLabel}
          >
            {h.mix.map(e => (
              <Box key={e.key} height="100%" bgcolor={e.color} width={`${(e.count / total) * 100}%`} title={`${e.count} ${e.label}`} />
            ))}
          </Box>
          <Box display="flex" flexWrap="wrap" gridGap={12} alignItems="center">
            {h.mix.map(e => (
              <Typography key={e.key} variant="body2" component="span">
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: e.color, marginRight: 5 }} />
                {e.count} {e.label}
              </Typography>
            ))}
            {h.worst && (
              <Typography variant="caption" component="span" style={{ marginLeft: 'auto', fontWeight: 600, color: '#c0392b' }}>
                Worst: {h.worst.label} · {h.worst.count}
              </Typography>
            )}
          </Box>
        </Box>
        <Box display="flex" gridGap={24}>
          <Kpi label="Avg score" value={String(h.avgScore)} delta={formatDelta(h.scoreDelta)} days={days} />
          <Kpi label="Images" value={String(h.images)} delta={formatDelta(h.imagesDelta)} days={days} />
        </Box>
      </Box>
    </InfoCard>
  );
}
