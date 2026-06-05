import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  Content,
  Header,
  InfoCard,
  Link,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import Box from '@material-ui/core/Box';
import Grid from '@material-ui/core/Grid';
import type { ExploreGroupBy } from '@regis/backstage-plugin-regis-common';
import { regisApiRef } from '../api/RegisApi';
import { unionLadder } from './format';
import { PortfolioStackedArea } from './portfolioChart';
import { PortfolioHealth } from './PortfolioHealth';
import { FacetRail, type ExploreState, type FacetKey } from './FacetRail';
import { Breakdown } from './Breakdown';
import { ImageList } from './ImageList';
import { QuickLookPanel } from './QuickLookPanel';
import { RegisEmptyState } from './RegisEmptyState';

function scopeSummary(
  filters: ExploreState['filters'],
  imageCount: number,
  days: number,
): string {
  const active = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  const head = active.length > 0 ? active.join(' · ') : 'All images';
  return `${head} · ${imageCount} images · ${days}d`;
}

const WINDOW_DAYS = 90;
const FACET_KEYS: FacetKey[] = ['system', 'owner', 'playbook', 'tier'];

function stateFromParams(params: URLSearchParams): ExploreState {
  const gb = params.get('groupBy');
  const groupBy: ExploreGroupBy =
    gb === 'owner' || gb === 'playbook' || gb === 'tier' ? gb : 'system';
  const filters: ExploreState['filters'] = {};
  for (const k of FACET_KEYS) {
    const v = params.get(k);
    if (v) filters[k] = v;
  }
  return { groupBy, filters };
}

function paramsFromState(state: ExploreState): URLSearchParams {
  const p = new URLSearchParams();
  p.set('groupBy', state.groupBy);
  for (const k of FACET_KEYS) {
    const v = state.filters[k];
    if (v) p.set(k, v);
  }
  return p;
}

export function RegisExplorerPage() {
  const api = useApi(regisApiRef);
  const [params, setParams] = useSearchParams();
  const state = stateFromParams(params);
  const [selected, setSelected] = useState<{ imageRef: string; tier?: string | null; score?: number } | null>(null);

  const setState = useCallback(
    (next: ExploreState) => setParams(paramsFromState(next)),
    [setParams],
  );

  // Close the quick-look when the scope changes — the selected image may fall
  // out of the new result set.
  const paramsKey = params.toString();
  useEffect(() => setSelected(null), [paramsKey]);

  const { value, loading, error } = useAsync(
    () =>
      Promise.all([
        api.explore({ groupBy: state.groupBy, days: WINDOW_DAYS, ...state.filters }),
        api.getPlaybooks(),
      ]),
    [params.toString()],
  );

  const [data, playbooksResp] = value ?? [undefined, undefined];
  const ladder = unionLadder(playbooksResp?.playbooks);

  const drill = (key: string) =>
    setState({ ...state, filters: { ...state.filters, [state.groupBy]: key } });

  const body = () => {
    if (loading) return <Progress />;
    if (error) return <ResponseErrorPanel error={error} />;
    if (!data) return null;
    if (data.images.length === 0) {
      const hasFilters = Object.keys(state.filters).length > 0;
      return (
        <RegisEmptyState
          title="No images match this scope."
          action={
            hasFilters ? (
              <Link
                component="button"
                onClick={() => setState({ groupBy: state.groupBy, filters: {} })}
              >
                Clear filters
              </Link>
            ) : undefined
          }
        />
      );
    }
    return (
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <InfoCard title="Scope">
            <FacetRail state={state} facets={data.facets} onChange={setState} />
          </InfoCard>
        </Grid>
        <Grid item xs={12} md={9}>
          <Box display="flex" flexDirection="column" gridGap={16}>
            <PortfolioHealth bands={data.trend.bands} buckets={data.trend.buckets} days={WINDOW_DAYS} />
            <InfoCard title="Posture over time">
              <PortfolioStackedArea bands={data.trend.bands} buckets={data.trend.buckets} />
            </InfoCard>
            <InfoCard title={`By ${state.groupBy}`}>
              <Breakdown groups={data.groups} ladder={ladder} onDrill={drill} />
            </InfoCard>
            <ImageList
              images={data.images}
              ladder={ladder}
              onSelect={ref => {
                const img = data.images.find(i => i.imageRef === ref);
                setSelected(img ? { imageRef: img.imageRef, tier: img.tier, score: img.score } : { imageRef: ref });
              }}
            />
          </Box>
        </Grid>
        {selected && (
          <QuickLookPanel
            imageRef={selected.imageRef}
            tier={selected.tier}
            score={selected.score}
            ladder={ladder}
            onClose={() => setSelected(null)}
          />
        )}
      </Grid>
    );
  };

  return (
    <Page themeId="tool">
      <Header
        title="Portfolio"
        subtitle={
          data
            ? scopeSummary(state.filters, data.images.length, WINDOW_DAYS)
            : 'Explore image posture across the portfolio'
        }
      />
      <Content>{body()}</Content>
    </Page>
  );
}
