import { resolveLadders, paletteColor, NONE_COLOR } from './LadderResolver';
import type {
  IndexPlaybookEntry,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-01-01',
  recordedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('resolveLadders', () => {
  it('uses the index ladder order and colors as the source of truth', () => {
    const playbooks: IndexPlaybookEntry[] = [
      { id: 'default', tiers: [{ name: 'Gold', color: '#d4af37' }, { name: 'Silver' }] },
    ];
    const map = resolveLadders({ playbooks, snapshots: [], overrides: [] });
    expect(map.get('default')).toEqual([
      { name: 'Gold', color: '#d4af37' },
      { name: 'Silver', color: paletteColor(1) },
    ]);
  });

  it('discovers a ladder from observed tiers when the index has none (sorted, palette colors)', () => {
    const snapshots = [
      snap({ playbook: 'p', tier: 'Beta' }),
      snap({ playbook: 'p', tier: 'Alpha' }),
      snap({ playbook: 'p', tier: null }),
    ];
    const map = resolveLadders({ playbooks: [], snapshots, overrides: [] });
    expect(map.get('p')).toEqual([
      { name: 'Alpha', color: paletteColor(0) },
      { name: 'Beta', color: paletteColor(1) },
    ]);
  });

  it('prefers the index ladder over discovery for the same playbook', () => {
    const playbooks: IndexPlaybookEntry[] = [{ id: 'p', tiers: [{ name: 'Gold' }] }];
    const snapshots = [snap({ playbook: 'p', tier: 'Bronze' })];
    const map = resolveLadders({ playbooks, snapshots, overrides: [] });
    expect(map.get('p')?.map(t => t.name)).toEqual(['Gold']);
  });

  it('applies a color override matched by tier (and optional playbook)', () => {
    const playbooks: IndexPlaybookEntry[] = [{ id: 'p', tiers: [{ name: 'Gold', color: '#000' }] }];
    const map = resolveLadders({
      playbooks,
      snapshots: [],
      overrides: [{ playbook: 'p', tier: 'Gold', color: '#fff' }],
    });
    expect(map.get('p')?.[0].color).toBe('#fff');
  });

  it('exposes a stable none color and a cyclic palette', () => {
    expect(typeof NONE_COLOR).toBe('string');
    expect(paletteColor(0)).toBe(paletteColor(6)); // palette has length 6
  });
});
