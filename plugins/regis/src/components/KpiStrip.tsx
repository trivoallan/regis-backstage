// plugins/regis/src/components/KpiStrip.tsx
import { InfoCard } from '@backstage/core-components';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';

function delta(latest: number, first: number): string {
  const d = latest - first;
  if (d === 0) return '±0';
  return d > 0 ? `▲ ${d}` : `▼ ${Math.abs(d)}`;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Grid item xs={6} sm={4} md={2}>
      <InfoCard title={label}>
        <Typography variant="h4">{value}</Typography>
        <Typography variant="caption" color="textSecondary">{sub}</Typography>
      </InfoCard>
    </Grid>
  );
}

/** KPI strip: one card per band (count from the latest bucket) + avg score + images. */
export function KpiStrip({
  bands,
  buckets,
  days,
}: {
  bands: TrendBand[];
  buckets: TrendBucket[];
  days: number;
}) {
  if (buckets.length === 0) return null;
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const at = (b: TrendBucket, key: string) => b.counts[key] ?? 0;
  const daysLabel = `${days}d`;
  return (
    <Grid container spacing={3}>
      {bands.map(band => (
        <Kpi
          key={band.key}
          label={band.label}
          value={String(at(last, band.key))}
          sub={`${delta(at(last, band.key), at(first, band.key))} over ${daysLabel}`}
        />
      ))}
      <Kpi label="Avg score" value={String(last.avgScore)} sub={`${delta(last.avgScore, first.avgScore)} over ${daysLabel}`} />
      <Kpi label="Images" value={String(last.total)} sub={`${delta(last.total, first.total)} over ${daysLabel}`} />
    </Grid>
  );
}
