import { tierColor, scoreStatus } from './format';

describe('formatting helpers', () => {
  it('maps tiers to colors', () => {
    expect(tierColor('Gold')).toBe('#d4af37');
    expect(tierColor('Silver')).toBe('#9ca3af');
    expect(tierColor('Bronze')).toBe('#cd7f32');
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
