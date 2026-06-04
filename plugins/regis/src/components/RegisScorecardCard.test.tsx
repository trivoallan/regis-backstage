import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { RegisScorecardCard } from './RegisScorecardCard';

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'svc',
    annotations: { 'regis.io/report-url': 'https://h/r.json' },
  },
  spec: {},
};

const playbooks = {
  playbooks: [
    {
      id: 'default',
      tiers: [
        { key: 'Gold', label: 'Gold', color: '#d4af37' },
        { key: 'Silver', label: 'Silver', color: '#9ca3af' },
        { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
      ],
    },
  ],
};

const renderCard = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisScorecardCard />
      </EntityProvider>
    </TestApiProvider>,
  );

describe('RegisScorecardCard', () => {
  it('shows score, tier chip in ladder color, next-tier hint, badges, counts and playbook footnote', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Silver',
          playbooks: [{ playbook_name: 'base-image-policy', playbook_version: '2.3' }],
          badges: [
            { scope: 'security', value: 'B', class: 'warning' },
            { scope: 'hygiene', value: 'A', class: 'success' },
          ],
          rules: [
            { slug: 'g1', description: 'd', level: 'Gold', passed: true, status: 'passed', message: '' },
            { slug: 'g2', description: 'd', level: 'Gold', passed: false, status: 'failed', message: '' },
            { slug: 'g3', description: 'd', level: 'Gold', passed: false, status: 'incomplete', message: '' },
          ],
          rules_summary: { score: 73, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => playbooks,
    });

    expect(await screen.findByText('73')).toBeInTheDocument();
    const chip = (await screen.findByText('Silver')).closest('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveStyle({ backgroundColor: '#9ca3af' });
    expect(await screen.findByText(/2 rules left for Gold/i)).toBeInTheDocument();
    expect(screen.getByText(/security/)).toBeInTheDocument();
    expect(screen.getByText(/hygiene/)).toBeInTheDocument();
    expect(screen.getByText(/via base-image-policy/i)).toBeInTheDocument();
  });

  it('shows no chase hint and never asserts a top tier when no rules remain', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Silver',
          rules: [
            { slug: 'g1', description: 'd', level: 'Gold', passed: true, status: 'passed', message: '' },
          ],
          rules_summary: { score: 100, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => playbooks,
    });
    // The tier chip and score still render, but no next-tier claim is made.
    expect(await screen.findByText('Silver')).toBeInTheDocument();
    expect(screen.queryByText(/rules left for/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Top tier/i)).not.toBeInTheDocument();
  });

  it('makes no next-tier claim for a top-of-ladder image', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Gold',
          rules: [],
          rules_summary: { score: 100, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => playbooks,
    });
    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.queryByText(/Top tier/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rules left for/i)).not.toBeInTheDocument();
  });

  it('shows "No tier assigned yet" for an untiered image with no ladder', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: null,
          rules: [],
          rules_summary: { score: 0, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => ({ playbooks: [] }),
    });
    expect(await screen.findByText(/No tier assigned yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Top tier/i)).not.toBeInTheDocument();
  });

  it('renders an error panel when the API fails', async () => {
    await renderCard({
      getReport: async () => {
        throw new Error('boom');
      },
      getPlaybooks: async () => ({ playbooks: [] }),
    });
    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0);
  });
});
