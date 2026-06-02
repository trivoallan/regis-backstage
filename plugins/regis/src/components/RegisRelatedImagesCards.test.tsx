import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import {
  EntityProvider,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import {
  RegisServiceImagesCard,
  RegisPlaybookImagesCard,
} from './RegisRelatedImagesCards';

const summaries: ReportSummary[] = [
  { entityRef: 'resource:default/img-a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
];

const api = {
  listReports: async () => summaries,
  getReport: async () => {
    throw new Error('not used');
  },
};

const renderWith = (entity: Entity, node: JSX.Element) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>{node}</EntityProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('RegisServiceImagesCard', () => {
  it('shows the images the component depends on', async () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'svc' },
      relations: [{ type: 'dependsOn', targetRef: 'resource:default/img-a' }],
    };
    renderWith(entity, <RegisServiceImagesCard />);
    expect(await screen.findByText('Images of this service')).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
  });
});

describe('RegisPlaybookImagesCard', () => {
  it('shows the images assessed against the playbook', async () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'pb' },
      spec: { type: 'regis-playbook' },
      relations: [
        { type: 'dependencyOf', targetRef: 'resource:default/img-a' },
      ],
    };
    renderWith(entity, <RegisPlaybookImagesCard />);
    expect(await screen.findByText('Assessed images')).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
  });
});
