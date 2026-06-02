import { createHash } from 'crypto';

export interface ParsedImageRef {
  registry?: string;
  repository: string;
  tag?: string;
  digest?: string;
}

/** Parses an OCI image reference into registry/repository:tag@digest parts. */
export function parseImageRef(ref: string): ParsedImageRef {
  let rest = ref;
  let digest: string | undefined;

  const at = rest.indexOf('@');
  if (at !== -1) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }

  let registry: string | undefined;
  const firstSlash = rest.indexOf('/');
  if (firstSlash !== -1) {
    const head = rest.slice(0, firstSlash);
    if (head.includes('.') || head.includes(':') || head === 'localhost') {
      registry = head;
      rest = rest.slice(firstSlash + 1);
    }
  }

  let tag: string | undefined;
  const lastColon = rest.lastIndexOf(':');
  if (lastColon !== -1) {
    tag = rest.slice(lastColon + 1);
    rest = rest.slice(0, lastColon);
  }

  return { registry, repository: rest, tag, digest };
}

const MAX_NAME = 63;

/** First 8 hex chars of the sha256 of the input — a stable short disambiguator. */
export function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/** Lowercases and maps a string to the Backstage entity-name charset `[a-z0-9._-]`. */
export function sanitizeName(raw: string): string {
  const mapped = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return mapped || 'unnamed';
}

/**
 * Deterministic, ≤63-char, collision-safe Backstage entity name for an image.
 * Appends `-<shortHash(imageRef)>` when the base is too long or already taken.
 * Mutates `taken` to record the assigned name.
 */
export function imageEntityName(
  repository: string,
  tag: string | undefined,
  imageRef: string,
  taken: Set<string>,
): string {
  const base = sanitizeName(`${repository}-${tag ?? 'latest'}`);
  let name = base;
  if (name.length > MAX_NAME || taken.has(name)) {
    const suffix = `-${shortHash(imageRef)}`; // 9 chars
    // Re-sanitise the truncated slice: the cut can expose a trailing separator
    // that would otherwise double up against the leading '-' of the suffix.
    const head = sanitizeName(base.slice(0, MAX_NAME - suffix.length));
    name = `${head}${suffix}`;
  }
  taken.add(name);
  return name;
}
