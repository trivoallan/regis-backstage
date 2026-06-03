import type { UrlReaderService } from '@backstage/backend-plugin-api';
import {
  FilesystemFragmentSource,
  type IndexFragmentSource,
} from './IndexFragmentSource';
import { UrlReaderFragmentSource } from './UrlReaderFragmentSource';

/**
 * Picks the right fragment source for an index directory URL: the local
 * filesystem for `file://` URLs (bundled demo), otherwise the SCM-backed
 * UrlReader (production repo tree URLs).
 */
export function makeFragmentSource(
  indexDirUrl: string,
  urlReader: UrlReaderService,
): IndexFragmentSource {
  return indexDirUrl.startsWith('file://')
    ? new FilesystemFragmentSource()
    : new UrlReaderFragmentSource(urlReader);
}
