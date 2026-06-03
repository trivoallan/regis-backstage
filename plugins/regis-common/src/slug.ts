/**
 * Deterministic, filesystem-safe slug for an image reference. Maps every
 * character outside `[A-Za-z0-9._-]` to `_`. Used for the intake fragment
 * filename AND for deriving the report URL, so the two stay consistent.
 *
 * Example: `registry-1.docker.io/library/nginx:1.27`
 *       -> `registry-1.docker.io_library_nginx_1.27`
 */
export function slugForImageRef(imageRef: string): string {
  return imageRef.replace(/[^A-Za-z0-9._-]/g, '_');
}
