import { Entity } from '@backstage/catalog-model';

/** Catalog annotation pointing at an image's Regis `report.json`. */
export const REGIS_ANNOTATION_REPORT_URL = 'regis.io/report-url';

/** Returns the report URL annotation for an entity, or undefined. */
export function getRegisReportUrl(entity: Entity): string | undefined {
  return entity.metadata.annotations?.[REGIS_ANNOTATION_REPORT_URL];
}

/** True when an entity carries a Regis report annotation. */
export function isRegisAvailable(entity: Entity): boolean {
  return Boolean(getRegisReportUrl(entity));
}
