import { slugForImageRef } from './slug';

describe('slugForImageRef', () => {
  it('maps a full image ref to a filesystem-safe slug', () => {
    expect(slugForImageRef('registry-1.docker.io/library/nginx:1.27')).toBe(
      'registry-1.docker.io_library_nginx_1.27',
    );
  });

  it('preserves the allowed charset [A-Za-z0-9._-] including case', () => {
    expect(slugForImageRef('ghcr.io/Shop/Storefront-Web:2.3.0')).toBe(
      'ghcr.io_Shop_Storefront-Web_2.3.0',
    );
  });

  it('replaces digests and every other separator with underscore', () => {
    expect(
      slugForImageRef('repo/app@sha256:abc123'),
    ).toBe('repo_app_sha256_abc123');
  });

  it('is deterministic', () => {
    const ref = 'registry-1.docker.io/library/nginx:1.27';
    expect(slugForImageRef(ref)).toBe(slugForImageRef(ref));
  });
});
