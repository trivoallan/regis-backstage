/** `spec.type` for a minted container-image Resource. */
export const REGIS_RESOURCE_TYPE_IMAGE = 'container-image';
/** `spec.type` for a minted playbook Resource. */
export const REGIS_RESOURCE_TYPE_PLAYBOOK = 'regis-playbook';

/** Annotation: full canonical analyzed image reference (authoritative identity). */
export const REGIS_ANNOTATION_IMAGE_REF = 'regis.io/image-ref';
/** Annotation: current resolved content digest (tracks the tag). */
export const REGIS_ANNOTATION_IMAGE_DIGEST = 'regis.io/image-digest';
/** Annotation: comma-separated other refs sharing this digest. */
export const REGIS_ANNOTATION_IMAGE_ALIASES = 'regis.io/image-aliases';
/** Annotation: exact integer score. */
export const REGIS_ANNOTATION_SCORE = 'regis.io/score';
/** Annotation: ISO date of the report snapshot. */
export const REGIS_ANNOTATION_SNAPSHOT_DATE = 'regis.io/snapshot-date';
/** Annotation: version of regis that produced the report. */
export const REGIS_ANNOTATION_REGIS_VERSION = 'regis.io/regis-version';
/** Annotation: entityRef of the playbook the image was assessed against. */
export const REGIS_ANNOTATION_PLAYBOOK = 'regis.io/playbook';
/** Annotation: original regis playbook id (kept when the Backstage name was sanitised). */
export const REGIS_ANNOTATION_PLAYBOOK_ID = 'regis.io/playbook-id';

/** Label: earned tier (queryable). */
export const REGIS_LABEL_TIER = 'regis.io/tier';
/** Label: score band bucket (queryable). */
export const REGIS_LABEL_SCORE_BAND = 'regis.io/score-band';

/** Annotation: entity refs of sibling images sharing this digest (source for the aliasOf relation). */
export const REGIS_ANNOTATION_ALIAS_OF = 'regis.io/alias-of';

/** Catalog relation type linking image Resources that share a digest (symmetric). */
export const REGIS_RELATION_ALIAS_OF = 'aliasOf';

/** Maps a 0-100 score to its band bucket label value. */
export function scoreBand(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  if (s < 50) return '0-49';
  if (s < 80) return '50-79';
  if (s < 90) return '80-89';
  return '90-100';
}
