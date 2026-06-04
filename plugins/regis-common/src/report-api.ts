import type { Report } from './types';

/** A report plus retrieval metadata, as served by `GET /report`. */
export interface ReportEnvelope {
  report: Report;
  meta: { fetchedAt: string; source: string; schemaVersion: number };
}

/** Compact per-entity row for the catalog page (`GET /reports`). */
export interface ReportSummary {
  entityRef: string;
  status: 'ok' | 'error' | 'pending';
  /** Canonical analyzed image reference (`registry/repository:tag`), when known. */
  imageRef?: string;
  tier?: string | null;
  score?: number;
  byTag?: Record<string, number>;
  error?: string;
}

/** A single point-in-time posture snapshot for an image (history series row). */
export interface ReportSnapshot {
  imageRef: string;
  snapshotDate: string; // ISO date
  digest?: string;
  tier?: string | null;
  score?: number;
  playbook?: string;
  reportUrl?: string;
  recordedAt: string; // ISO datetime
  owner?: string;
  system?: string;
}

/** An image's full snapshot history, as served by `GET /report/history`. */
export interface ReportHistory {
  imageRef: string;
  snapshots: ReportSnapshot[];
}

/** One band in a trend chart: a stacking layer with a stable key, label and color. */
export interface TrendBand {
  /** Stable id used as the key into `TrendBucket.counts`. */
  key: string;
  /** Human label for the legend/KPI card. */
  label: string;
  /** Display color (hex). */
  color: string;
}

/** One daily bucket of the portfolio's posture distribution. */
export interface TrendBucket {
  date: string; // ISO date (YYYY-MM-DD)
  /** Image count per band key (e.g. { rank1: 12, rank2: 5, none: 1 } or { Gold: 9 }). */
  counts: Record<string, number>;
  total: number; // sum of all counts values
  avgScore: number; // mean score across images with a numeric score (0 if none)
}

/** Portfolio posture over time, as served by `GET /portfolio/trend`. */
export interface PortfolioTrend {
  generatedAt: string; // ISO datetime
  days: number;
  filters: { system?: string; owner?: string; playbook?: string };
  facets: { systems: string[]; owners: string[]; playbooks: string[] };
  /** Stacking order = array order; the frontend renders entirely from this. */
  bands: TrendBand[];
  buckets: TrendBucket[];
}

/** A playbook's resolved ladder, as served by `GET /playbooks`. */
export interface PlaybookLadder {
  id: string;
  title?: string;
  /** Ordered best→worst; reuses TrendBand (key === label === tier name). */
  tiers: TrendBand[];
}

/** Response of `GET /playbooks`. */
export interface PlaybooksResponse {
  playbooks: PlaybookLadder[];
}

/** Group-by dimension for the explorer. */
export type ExploreGroupBy = 'system' | 'owner' | 'playbook' | 'tier';

/** One aggregated group in the explorer breakdown. */
export interface ExploreGroup {
  key: string;
  count: number;
  avgScore: number;
  /** Tier name → image count, for the mix bar. */
  tiers: Record<string, number>;
}

/** One image row (latest snapshot) in the scoped explorer list. */
export interface ExploreImage {
  imageRef: string;
  tier?: string | null;
  score?: number;
  system?: string;
  owner?: string;
  playbook?: string;
  digest?: string;
}

/** Response of `GET /portfolio/explore`. */
export interface ExploreResponse {
  filters: { system?: string; owner?: string; playbook?: string; tier?: string };
  groupBy: ExploreGroupBy;
  trend: { bands: TrendBand[]; buckets: TrendBucket[] };
  groups: ExploreGroup[];
  images: ExploreImage[];
  facets: { systems: string[]; owners: string[]; playbooks: string[]; tiers: string[] };
}
