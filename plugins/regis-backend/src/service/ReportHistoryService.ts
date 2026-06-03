import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import {
  getRegisImageRef,
  type ReportHistory,
} from '@regis/backstage-plugin-regis-common';
import { EntityNotFoundError } from './ReportService';
import type { ReportHistoryStore } from './ReportHistoryStore';

/** Thrown when an entity carries no `regis.io/image-ref` annotation. */
export class NoImageRefError extends Error {
  constructor(entityRef: string) {
    super(`no Regis image-ref annotation on ${entityRef}`);
    this.name = 'NoImageRefError';
  }
}

export interface ReportHistoryServiceDeps {
  catalog: CatalogService;
  store: ReportHistoryStore;
}

export class ReportHistoryService {
  constructor(private readonly deps: ReportHistoryServiceDeps) {}

  async getHistory(
    entityRef: string,
    credentials: BackstageCredentials,
  ): Promise<ReportHistory> {
    const entity = await this.deps.catalog.getEntityByRef(entityRef, {
      credentials,
    });
    if (!entity) throw new EntityNotFoundError(entityRef);
    const imageRef = getRegisImageRef(entity);
    if (!imageRef) throw new NoImageRefError(entityRef);
    const snapshots = await this.deps.store.getByImageRef(imageRef);
    return { imageRef, snapshots };
  }
}
