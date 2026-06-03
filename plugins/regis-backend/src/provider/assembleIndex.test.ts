import { mockServices } from '@backstage/backend-test-utils';
import { assembleIndex } from './assembleIndex';
import type { IndexFragment } from './IndexFragmentSource';

const base: IndexFragment = {
  path: 'index.json',
  content: {
    schemaVersion: 1,
    playbooks: [{ id: 'default', title: 'Default' }],
  },
};

function image(name: string, content: unknown): IndexFragment {
  return { path: `images/${name}.json`, content };
}

describe('assembleIndex', () => {
  it('assembles schemaVersion + playbooks + valid image entries', () => {
    const logger = mockServices.logger.mock();
    const index = assembleIndex(
      [
        base,
        image('a', { imageRef: 'r/a:1', reportUrl: 'https://x/a.json' }),
        image('b', { imageRef: 'r/b:1', reportUrl: 'https://x/b.json' }),
      ],
      logger,
    );

    expect(index.schemaVersion).toBe(1);
    expect(index.playbooks).toHaveLength(1);
    expect(index.images.map(i => i.imageRef).sort()).toEqual([
      'r/a:1',
      'r/b:1',
    ]);
  });

  it('skips an invalid fragment and warns, keeping the rest', () => {
    const logger = mockServices.logger.mock();
    const index = assembleIndex(
      [
        base,
        image('good', { imageRef: 'r/a:1', reportUrl: 'https://x/a.json' }),
        image('bad', { digest: 'sha256:abc' }), // missing imageRef + reportUrl
      ],
      logger,
    );

    expect(index.images.map(i => i.imageRef)).toEqual(['r/a:1']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('images/bad.json'),
    );
  });

  it('ignores files outside images/ (e.g. the base index.json)', () => {
    const logger = mockServices.logger.mock();
    const index = assembleIndex(
      [base, image('a', { imageRef: 'r/a:1', reportUrl: 'https://x/a.json' })],
      logger,
    );
    expect(index.images).toHaveLength(1);
  });

  it('throws when index.json is missing', () => {
    const logger = mockServices.logger.mock();
    expect(() =>
      assembleIndex(
        [image('a', { imageRef: 'r/a:1', reportUrl: 'https://x/a.json' })],
        logger,
      ),
    ).toThrow(/index\.json/);
  });
});
