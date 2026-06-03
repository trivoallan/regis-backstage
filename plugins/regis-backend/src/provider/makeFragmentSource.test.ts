import { mockServices } from '@backstage/backend-test-utils';
import { makeFragmentSource } from './makeFragmentSource';
import { FilesystemFragmentSource } from './IndexFragmentSource';
import { UrlReaderFragmentSource } from './UrlReaderFragmentSource';

describe('makeFragmentSource', () => {
  const urlReader = mockServices.urlReader.mock();

  it('returns a filesystem source for a file:// url', () => {
    expect(makeFragmentSource('file:///tmp/regis-index.d', urlReader)).toBeInstanceOf(
      FilesystemFragmentSource,
    );
  });

  it('returns a UrlReader source for an http(s) url', () => {
    expect(
      makeFragmentSource('https://github.com/o/r/tree/main/regis-index.d', urlReader),
    ).toBeInstanceOf(UrlReaderFragmentSource);
  });
});
