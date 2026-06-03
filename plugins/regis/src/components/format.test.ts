import { tierColor, scoreStatus } from './format';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';

describe('formatting helpers', () => {
  it('maps tiers to colors', () => {
    // With no ladder, known named tiers hash to a stable palette color (not the old hardcoded values).
    expect(tierColor('Gold')).toBe('#2e7d32');
    expect(tierColor('Silver')).toBe('#00838f');
    expect(tierColor('Bronze')).toBe('#2e7d32');
    expect(tierColor(null)).toBe('#9ca3af');
    expect(tierColor(undefined)).toBe('#9ca3af');
  });

  it('maps scores to a status bucket', () => {
    expect(scoreStatus(100)).toBe('ok');
    expect(scoreStatus(80)).toBe('warning');
    expect(scoreStatus(40)).toBe('error');
    expect(scoreStatus(undefined)).toBe('warning');
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
