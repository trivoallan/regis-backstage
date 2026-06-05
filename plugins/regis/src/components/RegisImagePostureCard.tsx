import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
  Table,
  type TableColumn,
} from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { Box, Chip } from '@material-ui/core';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { scoreBarColor, tierColor, unionLadder } from './format';
import { sortSummariesWorstFirst } from './rollup';
import { PostureRollup } from './PostureRollup';
import { RegisEmptyState } from './RegisEmptyState';

function makeColumns(ladder: TrendBand[]): TableColumn<ReportSummary>[] {
  return [
    {
      title: 'Image',
      field: 'imageRef',
      render: row => (
        <EntityRefLink entityRef={row.entityRef}>
          {row.imageRef ?? row.entityRef}
        </EntityRefLink>
      ),
    },
    {
      title: 'Tier',
      field: 'tier',
      render: row =>
        row.tier ? (
          <Chip
            size="small"
            label={row.tier}
            style={{ backgroundColor: tierColor(row.tier, ladder), color: '#fff' }}
          />
        ) : (
          <>—</>
        ),
    },
    {
      title: 'Score',
      field: 'score',
      type: 'numeric',
      render: row => (
        <Box display="flex" alignItems="center" gridGap={8} justifyContent="flex-end">
          <span>{row.score ?? '—'}</span>
          {row.score !== undefined && (
            <div style={{ width: 64, height: 6, borderRadius: 3, background: '#eee', overflow: 'hidden' }}>
              <div style={{ width: `${row.score}%`, height: '100%', background: scoreBarColor(row.score) }} />
            </div>
          )}
        </Box>
      ),
    },
  ];
}

/** Posture summary of a given set of image entityRefs (shared by the service and playbook cards). */
export function RegisImagePostureCard(props: {
  title: string;
  imageRefs: string[];
  exploreLink?: string;
}) {
  const { title, imageRefs, exploreLink } = props;
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(
    () => Promise.all([api.listReports(), api.getPlaybooks()]),
    [],
  );

  if (loading) {
    return (
      <InfoCard title={title}>
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title={title}>
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }

  const [reports, playbooksResp] = value ?? [undefined, undefined];
  const ladder = unionLadder(playbooksResp?.playbooks);
  const wanted = new Set(imageRefs);
  const rows = (reports ?? []).filter(r => wanted.has(r.entityRef));

  if (rows.length === 0) {
    return (
      <InfoCard title={title}>
        <RegisEmptyState title="No Regis-tracked images." />
      </InfoCard>
    );
  }

  const deepLink = exploreLink
    ? { title: 'View in explorer', link: exploreLink }
    : undefined;

  return (
    <InfoCard title={title} deepLink={deepLink}>
      <PostureRollup rows={rows} ladder={ladder} />
      <Table
        columns={makeColumns(ladder)}
        data={sortSummariesWorstFirst(rows, ladder)}
        options={{
          search: false,
          toolbar: false,
          padding: 'dense',
          paging: rows.length > 10,
          pageSize: 10,
        }}
      />
    </InfoCard>
  );
}
