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

function distribution(rows: ReportSummary[], order: string[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.status === 'ok' ? r.tier ?? 'untiered' : r.status;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rank = (k: string) =>
    order.indexOf(k) === -1 ? order.length : order.indexOf(k);
  return [...counts.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
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
  const order: string[] = [];
  for (const pb of playbooksResp?.playbooks ?? []) {
    for (const t of pb.tiers) if (!order.includes(t.key)) order.push(t.key);
  }

  const wanted = new Set(imageRefs);
  const rows = (reports ?? []).filter(r => wanted.has(r.entityRef));

  if (rows.length === 0) {
    return <InfoCard title={title}>No Regis-tracked images yet.</InfoCard>;
  }

  return (
    <InfoCard
      title={title}
      subheader={`${rows.length} images · ${distribution(rows, order)}`}
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
