import { Table, type TableColumn } from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { Box, Chip } from '@material-ui/core';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { type ReportSummary } from '../api/RegisApi';
import { scoreBarColor, tierColor } from './format';
import { sortSummariesWorstFirst } from './rollup';

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

/** Image / Tier / Score table for a set of report summaries, worst tier first. */
export function ImagePostureTable(props: { rows: ReportSummary[]; ladder: TrendBand[] }) {
  const { rows, ladder } = props;
  return (
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
  );
}
