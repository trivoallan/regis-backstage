import { tierColor, unionLadder, badgeClassColor, scoreBarColor, playbookLadder } from './format';
import type {
  PlaybookLadder,
  TrendBand,
} from '@regis/backstage-plugin-regis-common';

describe('formatting helpers', () => {
  it('maps tiers to colors', () => {
    // With no ladder, known named tiers hash to a stable palette color (not the old hardcoded values).
    expect(tierColor('Gold')).toBe('#2e7d32');
    expect(tierColor('Silver')).toBe('#00838f');
    expect(tierColor('Bronze')).toBe('#2e7d32');
    expect(tierColor(null)).toBe('#9ca3af');
    expect(tierColor(undefined)).toBe('#9ca3af');
  });
});

describe('tierColor', () => {
  const ladder: TrendBand[] = [
    { key: 'Gold', label: 'Gold', color: '#d4af37' },
    { key: 'Platinum', label: 'Platinum', color: '#7e57c2' },
  ];

  it('uses the ladder color when the tier is known', () => {
    expect(tierColor('Platinum', ladder)).toBe('#7e57c2');
  });

  it('matches a ladder entry by label when key differs', () => {
    const aliased: TrendBand[] = [{ key: 'tier-1', label: 'Gold', color: '#d4af37' }];
    expect(tierColor('Gold', aliased)).toBe('#d4af37');
  });

  it('falls back to a stable non-grey color for an unknown tier with no ladder', () => {
    const a = tierColor('Mystery');
    const b = tierColor('Mystery');
    expect(a).toBe(b); // deterministic
    expect(a).not.toBe('#9ca3af'); // not the neutral fallback
  });

  it('falls back to neutral grey for a missing tier', () => {
    expect(tierColor(null)).toBe('#9ca3af');
    expect(tierColor(undefined)).toBe('#9ca3af');
  });
});

describe('unionLadder', () => {
  const playbooks: PlaybookLadder[] = [
    {
      id: 'default',
      tiers: [
        { key: 'Gold', label: 'Gold', color: '#d4af37' },
        { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
      ],
    },
    {
      id: 'pci-dss',
      tiers: [
        { key: 'Platinum', label: 'Platinum', color: '#7e57c2' },
        { key: 'Gold', label: 'Gold', color: '#ffffff' }, // duplicate key, second wins NOT
      ],
    },
  ];

  it('flattens all ladders into one list, first occurrence of a key wins', () => {
    const u = unionLadder(playbooks);
    expect(u.map(b => b.key)).toEqual(['Gold', 'Bronze', 'Platinum']);
    expect(u.find(b => b.key === 'Gold')?.color).toBe('#d4af37');
  });

  it('returns an empty list for undefined or empty input', () => {
    expect(unionLadder()).toEqual([]);
    expect(unionLadder([])).toEqual([]);
  });

  it('feeds tierColor so a tier resolves to its published color regardless of playbook', () => {
    const u = unionLadder(playbooks);
    expect(tierColor('Platinum', u)).toBe('#7e57c2');
    expect(tierColor('Bronze', u)).toBe('#cd7f32');
  });
});

describe('scoreBarColor', () => {
  it('maps score bands to the badge palette', () => {
    expect(scoreBarColor(95)).toBe('#1e7d34');
    expect(scoreBarColor(70)).toBe('#a86700');
    expect(scoreBarColor(30)).toBe('#c0392b');
  });
});

describe('badgeClassColor', () => {
  it('maps each badge class to a color', () => {
    expect(badgeClassColor('success')).toBe('#1e7d34');
    expect(badgeClassColor('warning')).toBe('#a86700');
    expect(badgeClassColor('error')).toBe('#c0392b');
    expect(badgeClassColor('information')).toBe('#1565c0');
  });
});

describe('playbookLadder', () => {
  const playbooks: PlaybookLadder[] = [
    { id: 'default', tiers: [{ key: 'Gold', label: 'Gold', color: '#d4af37' }] },
    { id: 'pci-dss', tiers: [{ key: 'Pass', label: 'Pass', color: '#2e7d32' }] },
  ];

  it('returns the matching playbook tiers', () => {
    expect(playbookLadder(playbooks, 'pci-dss')).toEqual([
      { key: 'Pass', label: 'Pass', color: '#2e7d32' },
    ]);
  });

  it('returns [] for an unknown id, a missing id, or missing playbooks', () => {
    expect(playbookLadder(playbooks, 'nope')).toEqual([]);
    expect(playbookLadder(playbooks, undefined)).toEqual([]);
    expect(playbookLadder(undefined, 'default')).toEqual([]);
  });
});
