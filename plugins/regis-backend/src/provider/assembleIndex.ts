import type { LoggerService } from '@backstage/backend-plugin-api';
import {
  validateIndexImageEntry,
  validateReportIndex,
  type IndexImageEntry,
  type IndexPlaybookEntry,
  type ReportIndex,
} from '@regis/backstage-plugin-regis-common';
import type { IndexFragment } from './IndexFragmentSource';

function norm(path: string): string {
  return path.replace(/^\.?\//, '');
}

interface BaseDoc {
  schemaVersion?: number;
  playbooks?: IndexPlaybookEntry[];
}

/**
 * Assembles a `ReportIndex` from raw fragments. `index.json` supplies
 * `schemaVersion` + `playbooks`; every `images/*.json` is a single image entry.
 * Invalid image fragments are skipped with a warning (resilience: a single bad
 * merged file must not blank the whole catalog). The assembled index is then
 * validated as a whole.
 */
export function assembleIndex(
  fragments: IndexFragment[],
  logger: LoggerService,
): ReportIndex {
  const baseFragment = fragments.find(f => norm(f.path) === 'index.json');
  if (!baseFragment) {
    throw new Error(
      'index.json (schemaVersion + playbooks) not found in index directory',
    );
  }
  const base = baseFragment.content as BaseDoc;

  const images: IndexImageEntry[] = [];
  for (const fragment of fragments) {
    const path = norm(fragment.path);
    if (!path.startsWith('images/') || !path.endsWith('.json')) continue;
    try {
      images.push(validateIndexImageEntry(fragment.content));
    } catch (err) {
      logger.warn(
        `regis: skipping invalid index fragment ${fragment.path}: ${String(
          err,
        )}`,
      );
    }
  }

  return validateReportIndex({
    schemaVersion: base.schemaVersion,
    playbooks: base.playbooks,
    images,
  });
}
