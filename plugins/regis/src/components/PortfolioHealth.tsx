import { InfoCard } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';
// NOTE: we do not import from './portfolioHealth' here because on macOS
// case-insensitive filesystems Jest resolves './PortfolioHealth' (this file)
// and './portfolioHealth' to the same path (portfolioHealth.ts, since .ts <
// .tsx in moduleFileExtensions), causing this module to evaluate to the util
// module and export `undefined` for PortfolioHealth.  We inline the two small
// helpers instead.

interface MixEntry {
  key: string;
  label: string;
  color: string;
  count: number;
}

interface HealthSummary {
  mix: MixEntry[];
  worst: { label: string; count: number } | null;
  avgScore: number;
  images: number;
  scoreDelta: number;
  imagesDelta: number;
}

function fmt(d: number): string {
  if (d === 0) return '±0';
  return d > 0 ? `▲ ${d}` : `▼ ${Math.abs(d)}`;
}

function summarize(bands: TrendBand[], buckets: TrendBucket[]): HealthSummary {
  if (buckets.length === 0) {
    return { mix: [], worst: null, avgScore: 0, images: 0, scoreDelta: 0, imagesDelta: 0 };
  }
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const at = (b: TrendBucket, key: string) => b.counts[key] ?? 0;

  const mix: MixEntry[] = bands
    .map(b => ({ key: b.key, label: b.label, color: b.color, count: at(last, b.key) }))
    .filter(e => e.count > 0);

  let worst: { label: string; count: number } | null = null;
  for (let i = bands.length - 1; i >= 0; i--) {
    const count = at(last, bands[i].key);
    if (count > 0) {
      worst = i === 0 ? null : { label: bands[i].label, count };
      break;
    }
  }

  return {
    mix,
    worst,
    avgScore: last.avgScore,
    images: last.total,
    scoreDelta: last.avgScore - first.avgScore,
    imagesDelta: last.total - first.total,
  };
}

/** Portfolio health header: tier-mix bar + worst tier + headline KPIs with deltas. */
export function PortfolioHealth(props: {
  bands: TrendBand[];
  buckets: TrendBucket[];
  days: number;
}) {
  const { bands, buckets, days } = props;
  if (buckets.length === 0) return null;

  const h = summarize(bands, buckets);
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
          <Box>
            <Typography variant="caption" color="textSecondary" component="div" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Avg score
            </Typography>
            <Typography variant="h4" component="div">{String(h.avgScore)}</Typography>
            <Typography variant="caption" component="div">{`${fmt(h.scoreDelta)} / ${days}d`}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="textSecondary" component="div" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Images
            </Typography>
            <Typography variant="h4" component="div">{String(h.images)}</Typography>
            <Typography variant="caption" component="div">{`${fmt(h.imagesDelta)} / ${days}d`}</Typography>
          </Box>
        </Box>
      </Box>
    </InfoCard>
  );
}
