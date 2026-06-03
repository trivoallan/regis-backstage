import type {
  IndexPlaybookEntry,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';

/** A resolved tier: a name plus a concrete display color. */
export interface ResolvedTier {
  name: string;
  color: string;
}

/** An ordered ladder, best→worst. */
export type Ladder = ResolvedTier[];

/** playbookId → resolved ladder. */
export type LadderMap = Map<string, Ladder>;

/** A config-supplied color override, matched by tier name and optional playbook. */
export interface TierColorOverride {
  playbook?: string;
  tier: string;
  color: string;
}

/** Deterministic palette: green → amber → orange → red → purple → teal. Cyclic. */
const PALETTE = ['#2e7d32', '#9e9d24', '#ef6c00', '#c62828', '#6a1b9a', '#00838f'];

/** Color for the untiered band. Light grey, distinct from any palette entry. */
export const NONE_COLOR = '#e5e7eb';

/** Cyclic palette lookup by position. */
export function paletteColor(index: number): string {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

function overrideFor(
  overrides: TierColorOverride[],
  playbook: string,
  tier: string,
): string | undefined {
  // A playbook-specific override wins over a global (playbook-less) one.
  const scoped = overrides.find(o => o.playbook === playbook && o.tier === tier);
  if (scoped) return scoped.color;
  const global = overrides.find(o => o.playbook === undefined && o.tier === tier);
  return global?.color;
}

/**
 * Resolves `playbookId → ladder` in priority order: (1) the index ladder when a
 * playbook declares `tiers`, else (2) discovery from observed snapshot tiers
 * (sorted, no reliable rank). Colors come from an override, else the index
 * color, else the deterministic palette by position.
 */
export function resolveLadders(input: {
  playbooks?: IndexPlaybookEntry[];
  snapshots: ReportSnapshot[];
  overrides: TierColorOverride[];
}): LadderMap {
  const { playbooks = [], snapshots, overrides } = input;
  const map: LadderMap = new Map();

  // (1) Index ladders.
  for (const pb of playbooks) {
    if (!pb.tiers || pb.tiers.length === 0) continue;
    map.set(
      pb.id,
      pb.tiers.map((t, i) => ({
        name: t.name,
        color: overrideFor(overrides, pb.id, t.name) ?? t.color ?? paletteColor(i),
      })),
    );
  }

  // (2) Discovery fallback for playbooks without an index ladder.
  const discovered = new Map<string, Set<string>>();
  for (const s of snapshots) {
    if (!s.playbook || !s.tier) continue;
    if (map.has(s.playbook)) continue; // index ladder wins
    const set = discovered.get(s.playbook) ?? new Set<string>();
    set.add(s.tier);
    discovered.set(s.playbook, set);
  }
  for (const [id, names] of discovered) {
    const sorted = [...names].sort();
    map.set(
      id,
      sorted.map((name, i) => ({
        name,
        color: overrideFor(overrides, id, name) ?? paletteColor(i),
      })),
    );
  }

  return map;
}
