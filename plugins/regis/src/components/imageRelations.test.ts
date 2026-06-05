import type { Entity } from '@backstage/catalog-model';
import {
  imageRefsFromRelations,
  isComponentWithImageDeps,
  isRegisPlaybook,
  playbookExploreLink,
} from './imageRelations';

const component: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'svc', namespace: 'default' },
  relations: [
    { type: 'dependsOn', targetRef: 'resource:default/img-a' },
    { type: 'dependsOn', targetRef: 'component:default/lib' },
    { type: 'ownedBy', targetRef: 'group:default/team' },
  ],
};

describe('imageRefsFromRelations', () => {
  it('keeps only resource targets of the given relation type', () => {
    expect(imageRefsFromRelations(component, 'dependsOn')).toEqual([
      'resource:default/img-a',
    ]);
  });

  it('returns [] when the entity has no relations', () => {
    expect(
      imageRefsFromRelations({ ...component, relations: undefined }, 'dependsOn'),
    ).toEqual([]);
  });
});

describe('isComponentWithImageDeps', () => {
  it('is true for a Component that depends on a resource', () => {
    expect(isComponentWithImageDeps(component)).toBe(true);
  });

  it('is false for a Component with no resource dependency', () => {
    expect(isComponentWithImageDeps({ ...component, relations: [] })).toBe(false);
  });
});

describe('isRegisPlaybook', () => {
  it('is true for a regis-playbook Resource', () => {
    expect(
      isRegisPlaybook({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'pb' },
        spec: { type: 'regis-playbook' },
      }),
    ).toBe(true);
  });

  it('is false for a container-image Resource', () => {
    expect(
      isRegisPlaybook({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'img' },
        spec: { type: 'container-image' },
      }),
    ).toBe(false);
  });
});

import { isContainerImage } from './imageRelations';

describe('playbookExploreLink', () => {
  it('builds an explorer link scoped to the playbook id', () => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'regis-playbook-default', annotations: { 'regis.io/playbook-id': 'default' } },
      spec: { type: 'regis-playbook' },
    } as any;
    expect(playbookExploreLink(entity)).toBe('/?groupBy=playbook&playbook=default');
  });
  it('returns undefined when the playbook id annotation is absent', () => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'p' },
      spec: { type: 'regis-playbook' },
    } as any;
    expect(playbookExploreLink(entity)).toBeUndefined();
  });
});

describe('isContainerImage', () => {
  it('is true for a container-image Resource', () => {
    expect(
      isContainerImage({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'img' },
        spec: { type: 'container-image' },
      }),
    ).toBe(true);
  });

  it('is false for a playbook Resource', () => {
    expect(
      isContainerImage({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'pb' },
        spec: { type: 'regis-playbook' },
      }),
    ).toBe(false);
  });
});
