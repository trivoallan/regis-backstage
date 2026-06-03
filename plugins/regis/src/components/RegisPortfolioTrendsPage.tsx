import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  Content,
  Header,
  InfoCard,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import { regisApiRef } from '../api/RegisApi';
import { PortfolioStackedArea } from './portfolioChart';

const WINDOW_DAYS = 90;

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

export function RegisPortfolioTrendsPage() {
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(
    () => api.getPortfolioTrend(WINDOW_DAYS),
    [],
  );

  const body = () => {
    if (loading) return <Progress />;
    if (error) return <ResponseErrorPanel error={error} />;
    const buckets = value?.buckets ?? [];
    if (buckets.length === 0) return <Typography>No portfolio history recorded yet.</Typography>;

    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    const days = value?.days;
    const daysLabel = days !== undefined ? `${days}d` : '';
    return (
      <Grid container spacing={3}>
        <Kpi label="Gold" value={String(last.gold)} sub={`${delta(last.gold, first.gold)} over ${daysLabel}`} />
        <Kpi label="Silver" value={String(last.silver)} sub={`${delta(last.silver, first.silver)} over ${daysLabel}`} />
        <Kpi label="Bronze" value={String(last.bronze)} sub={`${delta(last.bronze, first.bronze)} over ${daysLabel}`} />
        <Kpi label="Avg score" value={String(last.avgScore)} sub={`${delta(last.avgScore, first.avgScore)} over ${daysLabel}`} />
        <Kpi label="Images" value={String(last.total)} sub={`${delta(last.total, first.total)} over ${daysLabel}`} />
        <Grid item xs={12}>
          <InfoCard title={`Posture over the last ${daysLabel}`}>
            <PortfolioStackedArea buckets={buckets} />
          </InfoCard>
        </Grid>
      </Grid>
    );
  };

  return (
    <Page themeId="tool">
      <Header title="Portfolio Trends" subtitle="Image posture across the portfolio over time" />
      <Content>{body()}</Content>
    </Page>
  );
}
