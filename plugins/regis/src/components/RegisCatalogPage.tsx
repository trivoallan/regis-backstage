import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  Content,
  Header,
  Page,
  Progress,
  ResponseErrorPanel,
  Table,
  type TableColumn,
} from '@backstage/core-components';
import { parseEntityRef } from '@backstage/catalog-model';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { tierColor, unionLadder } from './format';

function failingTags(byTag?: Record<string, number>): string {
  if (!byTag) return '';
  return Object.entries(byTag)
    .filter(([, score]) => score < 100)
    .map(([tag]) => tag)
    .join(', ');
}

/** Tier cell: a swatch in the playbook's published color + the tier name. */
function TierCell({ tier, ladder }: { tier?: string | null; ladder: TrendBand[] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        data-testid="tier-swatch"
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          display: 'inline-block',
          backgroundColor: tierColor(tier, ladder),
        }}
      />
      {tier ?? '—'}
    </span>
  );
}

function makeColumns(ladder: TrendBand[]): TableColumn<ReportSummary>[] {
  return [
    {
      title: 'Image',
      field: 'imageRef',
      render: row => row.imageRef ?? row.entityRef,
    },
    { title: 'Kind', render: row => parseEntityRef(row.entityRef).kind },
    {
      title: 'Tier',
      field: 'tier',
      render: row => <TierCell tier={row.tier} ladder={ladder} />,
    },
    { title: 'Score', field: 'score', type: 'numeric' },
    { title: 'Failing tags', render: row => failingTags(row.byTag) },
    { title: 'Status', field: 'status' },
  ];
}

/** Global table of every annotated entity's posture. */
export function RegisCatalogPage() {
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(
    () => Promise.all([api.listReports(), api.getPlaybooks()]),
    [],
  );

  const [reports, playbooksResp] = value ?? [undefined, undefined];
  const ladder = unionLadder(playbooksResp?.playbooks);

  return (
    <Page themeId="tool">
      <Header title="Regis" subtitle="Container posture across the catalog" />
      <Content>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {reports && (
          <Table
            title={`${reports.length} images`}
            columns={makeColumns(ladder)}
            data={reports}
            options={{ search: true, paging: true, pageSize: 20 }}
          />
        )}
      </Content>
    </Page>
  );
}
