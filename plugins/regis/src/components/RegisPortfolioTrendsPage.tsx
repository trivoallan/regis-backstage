import { useState } from 'react';
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
import FormControl from '@material-ui/core/FormControl';
import Grid from '@material-ui/core/Grid';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
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

function FacetSelect(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const labelId = `regis-facet-${props.label.toLowerCase()}`;
  return (
    <FormControl fullWidth>
      <InputLabel id={labelId}>{props.label}</InputLabel>
      <Select
        labelId={labelId}
        value={props.value}
        onChange={e => props.onChange(e.target.value as string)}
      >
        <MenuItem value="">All</MenuItem>
        {props.options.map(o => (
          <MenuItem key={o} value={o}>{o}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export function RegisPortfolioTrendsPage() {
  const api = useApi(regisApiRef);
  const [system, setSystem] = useState('');
  const [owner, setOwner] = useState('');
  const [playbook, setPlaybook] = useState('');
  const { value, loading, error } = useAsync(
    () =>
      api.getPortfolioTrend(WINDOW_DAYS, {
        system: system || undefined,
        owner: owner || undefined,
        playbook: playbook || undefined,
      }),
    [system, owner, playbook],
  );

  const facets = value?.facets ?? { systems: [], owners: [], playbooks: [] };
  const filtered = Boolean(
    system || owner || playbook || value?.filters?.system || value?.filters?.owner || value?.filters?.playbook,
  );

  const body = () => {
    if (loading) return <Progress />;
    if (error) return <ResponseErrorPanel error={error} />;
    const buckets = value?.buckets ?? [];
    const bands = value?.bands ?? [];
    if (buckets.length === 0) {
      return (
        <Typography>
          {filtered ? 'No history for this filter.' : 'No portfolio history recorded yet.'}
        </Typography>
      );
    }

    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    const daysLabel = value?.days !== undefined ? `${value.days}d` : '';
    const at = (b: typeof first, key: string) => b.counts[key] ?? 0;
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
        <Grid item xs={12}>
          <InfoCard title={`Posture over the last ${daysLabel}`}>
            <PortfolioStackedArea bands={bands} buckets={buckets} />
          </InfoCard>
        </Grid>
      </Grid>
    );
  };

  return (
    <Page themeId="tool">
      <Header title="Portfolio Trends" subtitle="Image posture across the portfolio over time" />
      <Content>
        <Grid container spacing={2} style={{ marginBottom: 16 }}>
          <Grid item xs={6} sm={3}>
            <FacetSelect label="System" value={system} options={facets.systems} onChange={setSystem} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <FacetSelect label="Owner" value={owner} options={facets.owners} onChange={setOwner} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <FacetSelect label="Playbook" value={playbook} options={facets.playbooks ?? []} onChange={setPlaybook} />
          </Grid>
        </Grid>
        {body()}
      </Content>
    </Page>
  );
}
