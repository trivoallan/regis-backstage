import {
  type Entity,
  getCompoundEntityRef,
  parseEntityRef,
} from '@backstage/catalog-model';
import {
  type CatalogProcessor,
  type CatalogProcessorEmit,
  processingResult,
} from '@backstage/plugin-catalog-node';
import {
  REGIS_ANNOTATION_ALIAS_OF,
  REGIS_RELATION_ALIAS_OF,
  REGIS_RESOURCE_TYPE_IMAGE,
} from '@regis/backstage-plugin-regis-common';

/**
 * Emits a symmetric `aliasOf` relation from each `container-image` Resource to the
 * sibling images recorded (as entity refs) in its `regis.io/alias-of` annotation.
 */
export class RegisAliasRelationProcessor implements CatalogProcessor {
  getProcessorName(): string {
    return 'RegisAliasRelationProcessor';
  }

  async postProcessEntity(
    entity: Entity,
    _location: unknown,
    emit: CatalogProcessorEmit,
  ): Promise<Entity> {
    const aliasOf = entity.metadata.annotations?.[REGIS_ANNOTATION_ALIAS_OF];
    if (
      entity.kind === 'Resource' &&
      entity.spec?.type === REGIS_RESOURCE_TYPE_IMAGE &&
      aliasOf
    ) {
      const source = getCompoundEntityRef(entity);
      for (const ref of aliasOf.split(',').map(r => r.trim()).filter(Boolean)) {
        let target;
        try {
          target = parseEntityRef(ref);
        } catch {
          continue; // skip malformed refs
        }
        emit(
          processingResult.relation({
            source,
            type: REGIS_RELATION_ALIAS_OF,
            target,
          }),
        );
      }
    }
    return entity;
  }
}
