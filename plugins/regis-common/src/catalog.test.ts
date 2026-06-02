import {
  REGIS_RESOURCE_TYPE_IMAGE,
  REGIS_RESOURCE_TYPE_PLAYBOOK,
  REGIS_ANNOTATION_IMAGE_REF,
  REGIS_ANNOTATION_IMAGE_DIGEST,
  REGIS_ANNOTATION_IMAGE_ALIASES,
  REGIS_ANNOTATION_SCORE,
  REGIS_ANNOTATION_SNAPSHOT_DATE,
  REGIS_ANNOTATION_REGIS_VERSION,
  REGIS_ANNOTATION_PLAYBOOK,
  REGIS_ANNOTATION_PLAYBOOK_ID,
  REGIS_LABEL_TIER,
  REGIS_LABEL_SCORE_BAND,
  REGIS_ANNOTATION_ALIAS_OF,
  REGIS_RELATION_ALIAS_OF,
  scoreBand,
} from './catalog';
import { getRegisImageRef } from './catalog';

describe('entity vocabulary', () => {
  it('uses the documented constant values', () => {
    expect(REGIS_RESOURCE_TYPE_IMAGE).toBe('container-image');
    expect(REGIS_RESOURCE_TYPE_PLAYBOOK).toBe('regis-playbook');
    expect(REGIS_ANNOTATION_IMAGE_REF).toBe('regis.io/image-ref');
    expect(REGIS_ANNOTATION_IMAGE_DIGEST).toBe('regis.io/image-digest');
    expect(REGIS_ANNOTATION_IMAGE_ALIASES).toBe('regis.io/image-aliases');
    expect(REGIS_ANNOTATION_SCORE).toBe('regis.io/score');
    expect(REGIS_ANNOTATION_SNAPSHOT_DATE).toBe('regis.io/snapshot-date');
    expect(REGIS_ANNOTATION_REGIS_VERSION).toBe('regis.io/regis-version');
    expect(REGIS_ANNOTATION_PLAYBOOK).toBe('regis.io/playbook');
    expect(REGIS_ANNOTATION_PLAYBOOK_ID).toBe('regis.io/playbook-id');
    expect(REGIS_LABEL_TIER).toBe('regis.io/tier');
    expect(REGIS_LABEL_SCORE_BAND).toBe('regis.io/score-band');
    expect(REGIS_ANNOTATION_ALIAS_OF).toBe('regis.io/alias-of');
    expect(REGIS_RELATION_ALIAS_OF).toBe('aliasOf');
  });
});

describe('scoreBand', () => {
  it.each([
    [0, '0-49'],
    [49, '0-49'],
    [50, '50-79'],
    [79, '50-79'],
    [80, '80-89'],
    [89, '80-89'],
    [90, '90-100'],
    [100, '90-100'],
  ])('maps %i -> %s', (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });

  it('clamps out-of-range scores', () => {
    expect(scoreBand(-5)).toBe('0-49');
    expect(scoreBand(150)).toBe('90-100');
  });
});

describe('getRegisImageRef', () => {
  it('returns the image-ref annotation when present', () => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: {
        name: 'library-nginx-1.27',
        annotations: { 'regis.io/image-ref': 'registry-1.docker.io/library/nginx:1.27' },
      },
      spec: { type: 'container-image' },
    } as any;
    expect(getRegisImageRef(entity)).toBe('registry-1.docker.io/library/nginx:1.27');
  });

  it('returns undefined when the annotation is absent', () => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'x' },
      spec: { type: 'container-image' },
    } as any;
    expect(getRegisImageRef(entity)).toBeUndefined();
  });
});
