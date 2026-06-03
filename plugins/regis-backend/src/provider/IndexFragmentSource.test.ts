import { createMockDirectory } from '@backstage/backend-test-utils';
import { pathToFileURL } from 'url';
import { FilesystemFragmentSource } from './IndexFragmentSource';

describe('FilesystemFragmentSource', () => {
  const mockDir = createMockDirectory();
  afterEach(() => mockDir.clear());

  it('lists every .json file with a path relative to the index dir', async () => {
    mockDir.setContent({
      'regis-index.d': {
        'index.json': JSON.stringify({ schemaVersion: 1, playbooks: [] }),
        images: {
          'a.json': JSON.stringify({ imageRef: 'r/a:1', reportUrl: 'u' }),
          'b.json': JSON.stringify({ imageRef: 'r/b:1', reportUrl: 'u' }),
        },
      },
    });
    const dirUrl = pathToFileURL(mockDir.resolve('regis-index.d')).href;

    const source = new FilesystemFragmentSource();
    const fragments = await source.list(dirUrl);

    const byPath = Object.fromEntries(
      fragments.map(f => [f.path.replace(/\\/g, '/'), f.content]),
    );
    expect(Object.keys(byPath).sort()).toEqual([
      'images/a.json',
      'images/b.json',
      'index.json',
    ]);
    expect((byPath['images/a.json'] as any).imageRef).toBe('r/a:1');
  });

  it('ignores non-json files', async () => {
    mockDir.setContent({
      'regis-index.d': {
        'index.json': JSON.stringify({ schemaVersion: 1 }),
        'README.md': '# not an entry',
        images: { 'a.json': JSON.stringify({ imageRef: 'r/a:1', reportUrl: 'u' }) },
      },
    });
    const dirUrl = pathToFileURL(mockDir.resolve('regis-index.d')).href;

    const fragments = await new FilesystemFragmentSource().list(dirUrl);
    const paths = fragments.map(f => f.path.replace(/\\/g, '/')).sort();
    expect(paths).toEqual(['images/a.json', 'index.json']);
  });

  it('throws a clear error when the dir url is not a file:// url', async () => {
    await expect(
      new FilesystemFragmentSource().list('https://example.test/regis-index.d'),
    ).rejects.toThrow(/file:\/\//);
  });
});
