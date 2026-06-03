import type { ReportEnvelope } from './types';

/**
 * Caches report envelopes by key (entityRef) — an ephemeral read cache.
 * Durable report *history* is a separate concern: see ReportHistoryStore.
 */
export interface ReportStore {
  get(key: string): ReportEnvelope | undefined;
  set(key: string, value: ReportEnvelope): void;
}

interface Entry {
  value: ReportEnvelope;
  expiresAt: number;
}

/** Bounded-TTL in-memory store. `now` is injectable for deterministic tests. */
export class InMemoryTtlStore implements ReportStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): ReportEnvelope | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: ReportEnvelope): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}
