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
import { regisApiRef, type ReportSummary } from '../api/RegisApi';

const columns: TableColumn<ReportSummary>[] = [
  { title: 'Entity', field: 'entityRef' },
  { title: 'Status', field: 'status' },
  { title: 'Tier', field: 'tier' },
  { title: 'Score', field: 'score', type: 'numeric' },
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
