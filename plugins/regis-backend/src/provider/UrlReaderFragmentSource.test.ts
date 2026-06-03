import type { UrlReaderService } from '@backstage/backend-plugin-api';
import { UrlReaderFragmentSource } from './UrlReaderFragmentSource';

function fakeReader(files: Array<{ path: string; content: string }>): UrlReaderService {
  return {
    readUrl: jest.fn(),
    readTree: jest.fn().mockResolvedValue({
      etag: 'etag',
      files: async () =>
        files.map(f => ({
          path: f.path,
          content: async () => Buffer.from(f.content, 'utf8'),
        })),
      archive: jest.fn(),
      dir: jest.fn(),
    }),
    search: jest.fn(),
  } as unknown as UrlReaderService;
}

describe('UrlReaderFragmentSource', () => {
  it('reads each .json file in the tree and parses its content', async () => {
    const reader = fakeReader([
      { path: 'index.json', content: JSON.stringify({ schemaVersion: 1 }) },
      {
        path: 'images/a.json',
        content: JSON.stringify({ imageRef: 'r/a:1', reportUrl: 'u' }),
      },
    ]);
    const source = new UrlReaderFragmentSource(reader);

    const fragments = await source.list('https://github.com/org/index/tree/main/regis-index.d');

    expect(reader.readTree).toHaveBeenCalledWith(
      'https://github.com/org/index/tree/main/regis-index.d',
    );
    const byPath = Object.fromEntries(fragments.map(f => [f.path, f.content]));
    expect(Object.keys(byPath).sort()).toEqual(['images/a.json', 'index.json']);
    expect((byPath['images/a.json'] as any).imageRef).toBe('r/a:1');
  });

  it('ignores non-json files in the tree', async () => {
    const reader = fakeReader([
      { path: 'index.json', content: JSON.stringify({ schemaVersion: 1 }) },
      { path: 'README.md', content: '# nope' },
    ]);
    const fragments = await new UrlReaderFragmentSource(reader).list('https://x/tree');
    expect(fragments.map(f => f.path)).toEqual(['index.json']);
  });
});
