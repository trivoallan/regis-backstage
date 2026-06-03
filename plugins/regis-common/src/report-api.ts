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
}

/** An image's full snapshot history, as served by `GET /report/history`. */
export interface ReportHistory {
  imageRef: string;
  snapshots: ReportSnapshot[];
}

/** One daily bucket of the portfolio's posture distribution. */
export interface TrendBucket {
  date: string; // ISO date (YYYY-MM-DD)
  gold: number;
  silver: number;
  bronze: number;
  none: number; // images whose as-of snapshot has no/unknown tier
  total: number; // gold + silver + bronze + none
  avgScore: number; // mean score across images with a numeric score (0 if none)
}

/** Portfolio posture over time, as served by `GET /portfolio/trend`. */
export interface PortfolioTrend {
  generatedAt: string; // ISO datetime
  days: number;
  buckets: TrendBucket[];
}
