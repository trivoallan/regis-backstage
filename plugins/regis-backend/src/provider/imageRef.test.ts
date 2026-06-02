import { parseImageRef, sanitizeName, imageEntityName, shortHash } from './imageRef';

describe('parseImageRef', () => {
  it('parses a full registry/repository:tag ref', () => {
    expect(parseImageRef('registry-1.docker.io/library/nginx:1.27')).toEqual({
      registry: 'registry-1.docker.io',
      repository: 'library/nginx',
      tag: '1.27',
      digest: undefined,
    });
  });

  it('treats a dotless first segment as repository (Docker Hub implied)', () => {
    expect(parseImageRef('library/nginx:1.27')).toEqual({
      registry: undefined,
      repository: 'library/nginx',
      tag: '1.27',
      digest: undefined,
    });
  });

  it('handles a registry with a port', () => {
    expect(parseImageRef('localhost:5000/team/app:dev')).toEqual({
      registry: 'localhost:5000',
      repository: 'team/app',
      tag: 'dev',
      digest: undefined,
    });
  });

  it('splits a trailing digest', () => {
    expect(parseImageRef('ghcr.io/acme/api@sha256:deadbeef')).toEqual({
      registry: 'ghcr.io',
      repository: 'acme/api',
      tag: undefined,
      digest: 'sha256:deadbeef',
    });
  });

  it('handles a ref with no tag', () => {
    expect(parseImageRef('ghcr.io/acme/api')).toEqual({
      registry: 'ghcr.io',
      repository: 'acme/api',
      tag: undefined,
      digest: undefined,
    });
  });
});

describe('sanitizeName', () => {
  it('lowercases and replaces illegal characters with dashes', () => {
    expect(sanitizeName('library/nginx:1.27')).toBe('library-nginx-1.27');
  });

  it('collapses repeats and trims leading/trailing separators', () => {
    expect(sanitizeName('--Foo//Bar..')).toBe('foo-bar');
  });

  it('falls back to "unnamed" for an all-illegal input', () => {
    expect(sanitizeName('@@@')).toBe('unnamed');
  });
});

describe('imageEntityName', () => {
  it('produces a readable base name for a normal ref', () => {
    const taken = new Set<string>();
    expect(
      imageEntityName('library/nginx', '1.27', 'docker.io/library/nginx:1.27', taken),
    ).toBe('library-nginx-1.27');
  });

  it('disambiguates a collision with a hash suffix', () => {
    const taken = new Set<string>();
    const first = imageEntityName('library/nginx', '1.27', 'reg-a/library/nginx:1.27', taken);
    const second = imageEntityName('library/nginx', '1.27', 'reg-b/library/nginx:1.27', taken);
    expect(first).toBe('library-nginx-1.27');
    expect(second).toBe(`library-nginx-1.27-${shortHash('reg-b/library/nginx:1.27')}`);
    expect(second).not.toBe(first);
  });

  it('truncates over-long names to <=63 chars with a hash suffix', () => {
    const taken = new Set<string>();
    const longRepo = `org/${'a'.repeat(80)}`;
    const name = imageEntityName(longRepo, 'v1', `reg/${longRepo}:v1`, taken);
    expect(name.length).toBeLessThanOrEqual(63);
    expect(name).toMatch(/-[0-9a-f]{8}$/);
  });

  it('defaults a missing tag to "latest"', () => {
    const taken = new Set<string>();
    expect(imageEntityName('acme/api', undefined, 'ghcr.io/acme/api', taken)).toBe(
      'acme-api-latest',
    );
  });
});
