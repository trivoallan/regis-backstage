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
import { regisApiRef, type ReportSummary } from '../api/RegisApi';

function failingTags(byTag?: Record<string, number>): string {
  if (!byTag) return '';
  return Object.entries(byTag)
    .filter(([, score]) => score < 100)
    .map(([tag]) => tag)
    .join(', ');
}

const columns: TableColumn<ReportSummary>[] = [
  {
    title: 'Image',
    field: 'imageRef',
    render: row => row.imageRef ?? row.entityRef,
  },
  { title: 'Kind', render: row => parseEntityRef(row.entityRef).kind },
  { title: 'Tier', field: 'tier' },
  { title: 'Score', field: 'score', type: 'numeric' },
  { title: 'Failing tags', render: row => failingTags(row.byTag) },
  { title: 'Status', field: 'status' },
];

/** Global table of every annotated entity's posture. */
export function RegisCatalogPage() {
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(() => api.listReports(), []);

  return (
    <Page themeId="tool">
      <Header title="Regis" subtitle="Container posture across the catalog" />
      <Content>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {value && (
          <Table
            title={`${value.length} images`}
            columns={columns}
            data={value}
            options={{ search: true, paging: true, pageSize: 20 }}
          />
        )}
      </Content>
    </Page>
  );
}
