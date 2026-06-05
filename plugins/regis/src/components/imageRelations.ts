import { type Entity, parseEntityRef } from '@backstage/catalog-model';
import { REGIS_ANNOTATION_PLAYBOOK_ID } from '@regis/backstage-plugin-regis-common';

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

/** A Resource minted as a Regis container image. */
export function isContainerImage(entity: Entity): boolean {
  return entity.kind === 'Resource' && entity.spec?.type === 'container-image';
}

/** Explorer route scoped to a playbook entity's id, or undefined when unknown. */
export function playbookExploreLink(entity: Entity): string | undefined {
  const id = entity.metadata.annotations?.[REGIS_ANNOTATION_PLAYBOOK_ID];
  return id ? `/?groupBy=playbook&playbook=${encodeURIComponent(id)}` : undefined;
}
