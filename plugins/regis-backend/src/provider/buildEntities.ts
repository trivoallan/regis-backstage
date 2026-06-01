import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  type Entity,
} from '@backstage/catalog-model';
import {
  REGIS_RESOURCE_TYPE_IMAGE,
  REGIS_RESOURCE_TYPE_PLAYBOOK,
  REGIS_ANNOTATION_REPORT_URL,
  REGIS_ANNOTATION_IMAGE_REF,
  REGIS_ANNOTATION_IMAGE_DIGEST,
  REGIS_ANNOTATION_IMAGE_ALIASES,
  REGIS_ANNOTATION_SCORE,
  REGIS_ANNOTATION_PLAYBOOK,
  REGIS_ANNOTATION_PLAYBOOK_ID,
  REGIS_LABEL_TIER,
  REGIS_LABEL_SCORE_BAND,
  scoreBand,
  type IndexPlaybookEntry,
  type IndexImageEntry,
  type ReportIndex,
} from '@regis/backstage-plugin-regis-common';
import { parseImageRef, sanitizeName, imageEntityName } from './imageRef';

export interface BuildOpts {
  indexUrl: string;
  defaultOwner: string;
  namespace: string;
}

function locationRef(indexUrl: string): string {
  return `regis-provider:${indexUrl}`;
}

/**
 * For each image, the list of OTHER imageRefs that resolve to the same digest.
 * Digest-less entries map to an empty array (treated as singletons).
 */
export function groupAliasesByDigest(
  images: IndexImageEntry[],
): Map<string, string[]> {
  const byDigest = new Map<string, string[]>();
  for (const img of images) {
    if (!img.digest) continue;
    const list = byDigest.get(img.digest) ?? [];
    list.push(img.imageRef);
    byDigest.set(img.digest, list);
  }

  const aliases = new Map<string, string[]>();
  for (const img of images) {
    const siblings = img.digest
      ? (byDigest.get(img.digest) ?? []).filter(r => r !== img.imageRef)
      : [];
    aliases.set(img.imageRef, siblings);
  }
  return aliases;
}

export function buildPlaybookEntity(
  entry: IndexPlaybookEntry,
  opts: BuildOpts,
): Entity {
  const location = locationRef(opts.indexUrl);
  const labels = entry.version
    ? { 'app.kubernetes.io/version': sanitizeName(entry.version) }
    : undefined;

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Resource',
    metadata: {
      name: sanitizeName(entry.id),
      namespace: opts.namespace,
      ...(entry.title ? { title: entry.title } : {}),
      ...(labels ? { labels } : {}),
      annotations: {
        [ANNOTATION_LOCATION]: location,
        [ANNOTATION_ORIGIN_LOCATION]: location,
        [REGIS_ANNOTATION_PLAYBOOK_ID]: entry.id,
      },
    },
    spec: {
      type: REGIS_RESOURCE_TYPE_PLAYBOOK,
      owner: entry.owner ?? opts.defaultOwner,
    },
  };
}

export function buildImageEntity(
  entry: IndexImageEntry,
  name: string,
  aliases: string[],
  opts: BuildOpts,
): Entity {
  const location = locationRef(opts.indexUrl);
  const parsed = parseImageRef(entry.imageRef);
  const shortRepo = parsed.repository.split('/').pop() ?? parsed.repository;
  const playbookRef = entry.playbook
    ? `resource:${opts.namespace}/${sanitizeName(entry.playbook)}`
    : undefined;

  const annotations: Record<string, string> = {
    [ANNOTATION_LOCATION]: location,
    [ANNOTATION_ORIGIN_LOCATION]: location,
    [REGIS_ANNOTATION_REPORT_URL]: entry.reportUrl,
    [REGIS_ANNOTATION_IMAGE_REF]: entry.imageRef,
  };
  if (entry.digest) annotations[REGIS_ANNOTATION_IMAGE_DIGEST] = entry.digest;
  if (aliases.length) {
    annotations[REGIS_ANNOTATION_IMAGE_ALIASES] = aliases.join(', ');
  }
  if (typeof entry.score === 'number') {
    annotations[REGIS_ANNOTATION_SCORE] = String(entry.score);
  }
  if (playbookRef) annotations[REGIS_ANNOTATION_PLAYBOOK] = playbookRef;

  const labels: Record<string, string> = {};
  if (entry.tier) labels[REGIS_LABEL_TIER] = sanitizeName(entry.tier);
  if (typeof entry.score === 'number') {
    labels[REGIS_LABEL_SCORE_BAND] = scoreBand(entry.score);
  }

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Resource',
    metadata: {
      name,
      namespace: opts.namespace,
      title: parsed.tag ? `${shortRepo}:${parsed.tag}` : shortRepo,
      description: `Container image ${entry.imageRef}`,
      ...(Object.keys(labels).length ? { labels } : {}),
      annotations,
    },
    spec: {
      type: REGIS_RESOURCE_TYPE_IMAGE,
      owner: entry.owner ?? opts.defaultOwner,
      ...(entry.system ? { system: entry.system } : {}),
      ...(playbookRef ? { dependsOn: [playbookRef] } : {}),
    },
  };
}

export function buildEntities(index: ReportIndex, opts: BuildOpts): Entity[] {
  const entities: Entity[] = [];

  for (const playbook of index.playbooks ?? []) {
    entities.push(buildPlaybookEntity(playbook, opts));
  }

  const aliasMap = groupAliasesByDigest(index.images);
  const taken = new Set<string>();
  for (const image of index.images) {
    const { repository, tag } = parseImageRef(image.imageRef);
    const name = imageEntityName(repository, tag, image.imageRef, taken);
    entities.push(
      buildImageEntity(image, name, aliasMap.get(image.imageRef) ?? [], opts),
    );
  }

  return entities;
}
