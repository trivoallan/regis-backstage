import { type Entity, parseEntityRef } from '@backstage/catalog-model';

/** EntityRefs of `resource:` targets reached from `entity` via `relationType`. */
export function imageRefsFromRelations(
  entity: Entity,
  relationType: string,
): string[] {
  return (entity.relations ?? [])
    .filter(
      r =>
        r.type === relationType &&
        parseEntityRef(r.targetRef).kind === 'resource',
    )
    .map(r => r.targetRef);
}

/** A Component that depends on at least one Resource (candidate for the images card). */
export function isComponentWithImageDeps(entity: Entity): boolean {
  return (
    entity.kind === 'Component' &&
    (entity.relations ?? []).some(
      r =>
        r.type === 'dependsOn' &&
        parseEntityRef(r.targetRef).kind === 'resource',
    )
  );
}

/** A Resource minted as a Regis playbook. */
export function isRegisPlaybook(entity: Entity): boolean {
  return entity.kind === 'Resource' && entity.spec?.type === 'regis-playbook';
}
