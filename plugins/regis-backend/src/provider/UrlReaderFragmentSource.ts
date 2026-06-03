import type { UrlReaderService } from '@backstage/backend-plugin-api';
import type { IndexFragment, IndexFragmentSource } from './IndexFragmentSource';

/**
 * Enumerates index fragments from a remote SCM directory using the Backstage
 * UrlReader. `indexDirUrl` is a repo tree URL (e.g. a GitHub `.../tree/main/...`
 * URL) backed by a configured integration.
 */
export class UrlReaderFragmentSource implements IndexFragmentSource {
  constructor(private readonly reader: UrlReaderService) {}

  async list(indexDirUrl: string): Promise<IndexFragment[]> {
    const tree = await this.reader.readTree(indexDirUrl);
    const files = await tree.files();
    const fragments: IndexFragment[] = [];
    for (const file of files) {
      if (!file.path.endsWith('.json')) continue;
      const buffer = await file.content();
      fragments.push({
        path: file.path,
        content: JSON.parse(buffer.toString('utf8')),
      });
    }
    return fragments;
  }
}
