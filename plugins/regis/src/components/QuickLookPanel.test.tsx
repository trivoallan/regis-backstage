import '@testing-library/jest-dom';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { catalogApiRef, entityRouteRef } from '@backstage/plugin-catalog-react';
import { screen, waitFor } from '@testing-library/react';
import { regisApiRef } from '../api/RegisApi';
import { QuickLookPanel } from './QuickLookPanel';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [{ key: 'Gold', label: 'Gold', color: '#d4af37' }];
const IMAGE_REF = 'ghcr.io/shop/catalog-api:4.1.0';

// The real catalog entity name (shop-catalog-api-4.1.0) is NOT the image-ref
// slug — it is resolved by the regis.io/image-ref annotation.
const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: 'shop-catalog-api-4.1.0',
    namespace: 'default',
    annotations: { 'regis.io/image-ref': IMAGE_REF },
  },
  spec: { type: 'container-image' },
};

const history = {
  imageRef: IMAGE_REF,
  snapshots: [
    { imageRef: IMAGE_REF, snapshotDate: '2026-05-01', score: 70, tier: 'Gold', recordedAt: '2026-05-01T00:00:00.000Z' },
    { imageRef: IMAGE_REF, snapshotDate: '2026-06-01', score: 95, tier: 'Gold', recordedAt: '2026-06-01T00:00:00.000Z' },
  ],
};

function renderPanel(opts: { entities?: unknown[]; getHistory?: jest.Mock } = {}) {
  const getHistory = opts.getHistory ?? jest.fn().mockResolvedValue(history);
  const catalogApi = {
    getEntities: jest.fn().mockResolvedValue({ items: opts.entities ?? [entity] }),
  };
  const api = {
    getHistory,
    getReport: async () => { throw new Error('not used'); },
    listReports: async () => [],
    getPortfolioTrend: async () => { throw new Error('not used'); },
    getPlaybooks: async () => ({ playbooks: [] }),
    explore: async () => { throw new Error('not used'); },
  };
  return {
    getHistory,
    catalogApi,
    ...renderInTestApp(
      <TestApiProvider apis={[[regisApiRef, api], [catalogApiRef, catalogApi as any]]}>
        <QuickLookPanel imageRef={IMAGE_REF} tier="Gold" score={95} ladder={ladder} onClose={jest.fn()} />
      </TestApiProvider>,
      { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
    ),
  };
}

describe('QuickLookPanel', () => {
  it('resolves the entity by its image-ref annotation and links to it', async () => {
    const { catalogApi, getHistory } = renderPanel();
    expect(screen.getByText(/Gold/)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /score trajectory/i })).toBeInTheDocument();

    // looked the entity up by the image-ref annotation, not a derived slug
    expect(catalogApi.getEntities).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          'metadata.annotations.regis.io/image-ref': IMAGE_REF,
        }),
      }),
    );
    // history + link both use the resolved ref, not the image-ref slug
    await waitFor(() =>
      expect(getHistory).toHaveBeenCalledWith('resource:default/shop-catalog-api-4.1.0'),
    );
    const link = await screen.findByText(/open image page/i);
    expect(link.closest('a')?.getAttribute('href')).toContain('shop-catalog-api-4.1.0');
  });

  it('shows a not-in-catalog note and does not fetch history when no entity matches', async () => {
    const getHistory = jest.fn();
    renderPanel({ entities: [], getHistory });
    expect(await screen.findByText(/not in the catalog/i)).toBeInTheDocument();
    expect(screen.queryByText(/open image page/i)).not.toBeInTheDocument();
    expect(getHistory).not.toHaveBeenCalled();
  });
});
