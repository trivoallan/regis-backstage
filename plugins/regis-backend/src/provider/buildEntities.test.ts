import type {
  IndexImageEntry,
  ReportIndex,
} from '@regis/backstage-plugin-regis-common';
import {
  groupAliasesByDigest,
  buildPlaybookEntity,
  buildImageEntity,
  buildEntities,
  type BuildOpts,
} from './buildEntities';

const img = (imageRef: string, digest?: string): IndexImageEntry => ({
  imageRef,
  digest,
  reportUrl: `https://h/${imageRef}.json`,
});

const opts: BuildOpts = {
  indexUrl: 'https://h/index.json',
  defaultOwner: 'group:default/guests',
  namespace: 'default',
};

describe('groupAliasesByDigest', () => {
  it('links refs that share a digest, excluding self', () => {
    const aliases = groupAliasesByDigest([
      img('r/nginx:1.27', 'sha256:aaa'),
      img('r/nginx:latest', 'sha256:aaa'),
      img('r/redis:7', 'sha256:bbb'),
    ]);
    expect(aliases.get('r/nginx:1.27')).toEqual(['r/nginx:latest']);
    expect(aliases.get('r/nginx:latest')).toEqual(['r/nginx:1.27']);
    expect(aliases.get('r/redis:7')).toEqual([]);
  });

  it('treats digest-less entries as singletons', () => {
    const aliases = groupAliasesByDigest([img('r/nginx:1.27')]);
    expect(aliases.get('r/nginx:1.27')).toEqual([]);
  });
});

describe('buildPlaybookEntity', () => {
  it('maps the v0.34.0 envelope metadata onto a Resource', () => {
    const entity = buildPlaybookEntity(
      {
        id: 'default',
        title: 'Regis Default Playbook',
        version: '1.0.0',
        owner: 'group:default/team-platform',
      },
      opts,
    );
    expect(entity.kind).toBe('Resource');
    expect(entity.metadata.name).toBe('default');
    expect(entity.metadata.title).toBe('Regis Default Playbook');
    expect(entity.metadata.labels?.['app.kubernetes.io/version']).toBe('1.0.0');
    expect(entity.metadata.annotations?.['regis.io/playbook-id']).toBe('default');
    expect(
      entity.metadata.annotations?.['backstage.io/managed-by-location'],
    ).toBe('regis-provider:https://h/index.json');
    expect(entity.spec?.type).toBe('regis-playbook');
    expect(entity.spec?.owner).toBe('group:default/team-platform');
  });

  it('falls back to the default owner when none is given', () => {
    const entity = buildPlaybookEntity({ id: 'minimal' }, opts);
    expect(entity.spec?.owner).toBe('group:default/guests');
    expect(entity.metadata.labels).toBeUndefined();
  });
});

describe('buildImageEntity', () => {
  const entry: IndexImageEntry = {
    imageRef: 'registry-1.docker.io/library/nginx:1.27',
    digest: 'sha256:aaa',
    reportUrl: 'https://h/nginx-1.27/report.json',
    tier: 'Gold',
    score: 100,
    playbook: 'default',
    owner: 'group:default/team-platform',
    system: 'nginx',
  };

  it('maps posture into labels + annotations and wires dependsOn', () => {
    const entity = buildImageEntity(
      entry,
      'library-nginx-1.27',
      ['registry-1.docker.io/library/nginx:latest'],
      opts,
    );
    expect(entity.kind).toBe('Resource');
    expect(entity.metadata.name).toBe('library-nginx-1.27');
    expect(entity.metadata.title).toBe('nginx:1.27');
    expect(entity.metadata.labels?.['regis.io/tier']).toBe('gold');
    expect(entity.metadata.labels?.['regis.io/score-band']).toBe('90-100');
    const ann = entity.metadata.annotations ?? {};
    expect(ann['regis.io/report-url']).toBe('https://h/nginx-1.27/report.json');
    expect(ann['regis.io/image-ref']).toBe(
      'registry-1.docker.io/library/nginx:1.27',
    );
    expect(ann['regis.io/image-digest']).toBe('sha256:aaa');
    expect(ann['regis.io/image-aliases']).toBe(
      'registry-1.docker.io/library/nginx:latest',
    );
    expect(ann['regis.io/score']).toBe('100');
    expect(ann['regis.io/playbook']).toBe('resource:default/default');
    expect(entity.spec?.type).toBe('container-image');
    expect(entity.spec?.owner).toBe('group:default/team-platform');
    expect(entity.spec?.system).toBe('nginx');
    expect(entity.spec?.dependsOn).toEqual(['resource:default/default']);
  });

  it('omits optional fields and falls back to the default owner', () => {
    const entity = buildImageEntity(
      { imageRef: 'ghcr.io/acme/api:dev', reportUrl: 'https://h/api.json' },
      'acme-api-dev',
      [],
      opts,
    );
    const ann = entity.metadata.annotations ?? {};
    expect(entity.metadata.labels).toBeUndefined();
    expect(ann['regis.io/image-digest']).toBeUndefined();
    expect(ann['regis.io/image-aliases']).toBeUndefined();
    expect(ann['regis.io/playbook']).toBeUndefined();
    expect(entity.spec?.owner).toBe('group:default/guests');
    expect(entity.spec?.dependsOn).toBeUndefined();
    expect(entity.spec?.system).toBeUndefined();
  });
});

describe('buildEntities', () => {
  const index: ReportIndex = {
    schemaVersion: 1,
    playbooks: [{ id: 'default', title: 'Default', version: '1.0.0' }],
    images: [
      {
        imageRef: 'registry-1.docker.io/library/nginx:1.27',
        digest: 'sha256:aaa',
        reportUrl: 'https://h/a.json',
        tier: 'Gold',
        score: 100,
        playbook: 'default',
      },
      {
        imageRef: 'registry-1.docker.io/library/nginx:latest',
        digest: 'sha256:aaa',
        reportUrl: 'https://h/b.json',
        tier: 'Gold',
        score: 100,
        playbook: 'default',
      },
    ],
  };

  it('emits one playbook + one image per entry, with aliases cross-linked', () => {
    const entities = buildEntities(index, opts);
    expect(entities).toHaveLength(3); // 1 playbook + 2 images

    const names = entities.map(e => `${e.kind}:${e.metadata.name}`);
    expect(names).toEqual([
      'Resource:default',
      'Resource:library-nginx-1.27',
      'Resource:library-nginx-latest',
    ]);

    const first = entities.find(e => e.metadata.name === 'library-nginx-1.27');
    expect(first?.metadata.annotations?.['regis.io/image-aliases']).toBe(
      'registry-1.docker.io/library/nginx:latest',
    );
    const second = entities.find(e => e.metadata.name === 'library-nginx-latest');
    expect(second?.metadata.annotations?.['regis.io/image-aliases']).toBe(
      'registry-1.docker.io/library/nginx:1.27',
    );
  });
});
