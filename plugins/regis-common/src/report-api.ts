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
