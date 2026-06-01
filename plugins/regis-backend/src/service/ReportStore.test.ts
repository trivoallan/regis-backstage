import { InMemoryTtlStore } from './ReportStore';
import type { ReportEnvelope } from './types';

const env = (): ReportEnvelope => ({
  report: { schemaVersion: 1 } as ReportEnvelope['report'],
  meta: { fetchedAt: '2026-06-01T00:00:00Z', source: 'http', schemaVersion: 1 },
});

describe('InMemoryTtlStore', () => {
  it('returns a stored value within the TTL', () => {
    let now = 1000;
    const store = new InMemoryTtlStore(5000, () => now);
    store.set('k', env());
    now = 4000;
    expect(store.get('k')).toBeDefined();
  });

  it('expires a value past the TTL', () => {
    let now = 1000;
    const store = new InMemoryTtlStore(5000, () => now);
    store.set('k', env());
    now = 7000;
    expect(store.get('k')).toBeUndefined();
  });

  it('returns undefined for unknown keys', () => {
    const store = new InMemoryTtlStore(5000, () => 0);
    expect(store.get('missing')).toBeUndefined();
  });
});
