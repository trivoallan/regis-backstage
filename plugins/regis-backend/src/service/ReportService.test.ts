import { mockServices, mockCredentials } from '@backstage/backend-test-utils';
import { UnsupportedSchemaVersionError } from '@regis/backstage-plugin-regis-common';
import {
  ReportService,
  NoReportError,
  EntityNotFoundError,
} from './ReportService';
import { InMemoryTtlStore } from './ReportStore';
import type { ReportSource } from './ReportSource';

const validReport = {
  schemaVersion: 1,
  version: '0.33.0',
  request: {
    url: 'registry-1.docker.io/library/nginx:1.27',
    registry: 'registry-1.docker.io',
    repository: 'library/nginx',
    tag: '1.27',
    analyzers: ['oci'],
    timestamp: '2026-05-31T12:00:00+00:00',
  },
  results: {},
};
const futureReport = { ...validReport, schemaVersion: 2 };

const entityWith = (url?: string) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'svc',
    annotations: url ? { 'regis.io/report-url': url } : {},
  },
  spec: {},
});

const credentials = mockCredentials.user();

function makeService(opts: {
  entity?: ReturnType<typeof entityWith>;
  source: ReportSource;
}) {
  const catalog = {
    getEntityByRef: jest.fn().mockResolvedValue(opts.entity),
  };
  return new ReportService({
    catalog: catalog as any,
    source: opts.source,
    store: new InMemoryTtlStore(60_000, () => 1000),
    logger: mockServices.logger.mock(),
  });
}

describe('ReportService.getReport', () => {
  it('fetches, validates, caches and returns an envelope', async () => {
    const source = { fetch: jest.fn().mockResolvedValue(validReport) };
    const svc = makeService({ entity: entityWith('https://h/r.json'), source });

    const first = await svc.getReport('component:default/svc', credentials);
    expect(first.report.request.repository).toBe('library/nginx');
    expect(first.meta.schemaVersion).toBe(1);

    await svc.getReport('component:default/svc', credentials);
    expect(source.fetch).toHaveBeenCalledTimes(1); // served from cache
  });

  it('throws NoReportError when the entity exists but the annotation is absent', async () => {
    const source = { fetch: jest.fn() };
    const svc = makeService({ entity: entityWith(undefined), source });
    await expect(
      svc.getReport('component:default/svc', credentials),
    ).rejects.toThrow(NoReportError);
    expect(source.fetch).not.toHaveBeenCalled();
  });

  it('throws EntityNotFoundError when the entity does not exist', async () => {
    const source = { fetch: jest.fn() };
    const svc = makeService({ entity: undefined, source });
    await expect(
      svc.getReport('component:default/svc', credentials),
    ).rejects.toThrow(EntityNotFoundError);
    expect(source.fetch).not.toHaveBeenCalled();
  });

  it('propagates UnsupportedSchemaVersionError from the validator', async () => {
    const source = { fetch: jest.fn().mockResolvedValue(futureReport) };
    const svc = makeService({ entity: entityWith('https://h/r.json'), source });
    await expect(
      svc.getReport('component:default/svc', credentials),
    ).rejects.toThrow(UnsupportedSchemaVersionError);
  });
});
