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
import { regisApiRef, type ReportSummary } from '../api/RegisApi';

const TIER_ORDER = ['Gold', 'Silver', 'Bronze'];

function distribution(rows: ReportSummary[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.status === 'ok' ? r.tier ?? 'untiered' : r.status;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rank = (k: string) =>
    TIER_ORDER.indexOf(k) === -1 ? TIER_ORDER.length : TIER_ORDER.indexOf(k);
  return [...counts.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([k, n]) => `${n} ${k}`)
    .join(' · ');
}

const columns: TableColumn<ReportSummary>[] = [
  {
    title: 'Image',
    field: 'entityRef',
    render: row => (
      <EntityRefLink entityRef={row.entityRef}>
        {row.imageRef ?? row.entityRef}
      </EntityRefLink>
    ),
  },
  { title: 'Tier', field: 'tier' },
  { title: 'Score', field: 'score', type: 'numeric' },
];

/** Posture summary of a given set of image entityRefs (shared by the service and playbook cards). */
export function RegisImagePostureCard(props: {
  title: string;
  imageRefs: string[];
}) {
  const { title, imageRefs } = props;
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(() => api.listReports(), []);

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

  const wanted = new Set(imageRefs);
  const rows = (value ?? []).filter(r => wanted.has(r.entityRef));

  if (rows.length === 0) {
    return <InfoCard title={title}>No Regis-tracked images yet.</InfoCard>;
  }

  return (
    <InfoCard
      title={title}
      subheader={`${rows.length} images · ${distribution(rows)}`}
    >
      <Table
        columns={columns}
        data={rows}
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
