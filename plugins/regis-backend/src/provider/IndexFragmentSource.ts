import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { join, relative, sep } from 'path';

/** One file under the index directory; `path` is relative to that directory. */
export interface IndexFragment {
  path: string;
  content: unknown;
}

/** Enumerates the JSON fragment files that make up a directory-based index. */
export interface IndexFragmentSource {
  list(indexDirUrl: string): Promise<IndexFragment[]>;
}

async function walkJson(root: string, dir: string): Promise<IndexFragment[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: IndexFragment[] = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkJson(root, abs)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const raw = await fs.readFile(abs, 'utf8');
      out.push({
        path: relative(root, abs).split(sep).join('/'),
        content: JSON.parse(raw),
      });
    }
  }
  return out;
}

/**
 * Reads index fragments from a local directory addressed by a `file://` URL.
 * Used by the bundled demo (which serves `examples/` from disk).
 */
export class FilesystemFragmentSource implements IndexFragmentSource {
  async list(indexDirUrl: string): Promise<IndexFragment[]> {
    if (!indexDirUrl.startsWith('file://')) {
      throw new Error(
        `FilesystemFragmentSource requires a file:// url, got ${indexDirUrl}`,
      );
    }
    const root = fileURLToPath(indexDirUrl);
    return walkJson(root, root);
  }
}
