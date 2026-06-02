import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { EntityProvider, entityRouteRef } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { RegisAliasesCard } from './RegisAliasesCard';

const renderCard = (entity: Entity) =>
  renderInTestApp(
    <EntityProvider entity={entity}>
      <RegisAliasesCard />
    </EntityProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

const imageWith = (relations: { type: string; targetRef: string }[]): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name: 'library-nginx-1.27', namespace: 'default' },
  spec: { type: 'container-image' },
  relations,
});

describe('RegisAliasesCard', () => {
  it('lists aliasOf relation targets as links', async () => {
    renderCard(
      imageWith([
        { type: 'aliasOf', targetRef: 'resource:default/library-nginx-latest' },
        { type: 'dependsOn', targetRef: 'resource:default/regis-playbook-default' },
      ]),
    );
    expect(await screen.findByText('Aliases')).toBeInTheDocument();
    expect(screen.getByText('library-nginx-latest')).toBeInTheDocument();
    expect(screen.queryByText('regis-playbook-default')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no aliasOf relations', () => {
    renderCard(imageWith([]));
    expect(screen.queryByText('Aliases')).not.toBeInTheDocument();
  });
});
