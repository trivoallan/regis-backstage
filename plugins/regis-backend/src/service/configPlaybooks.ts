import type { RootConfigService } from '@backstage/backend-plugin-api';
import type { IndexPlaybookEntry } from '@regis/backstage-plugin-regis-common';

/**
 * Reads authoritative playbook tier ladders declared under `regis.playbooks`.
 *
 * This is the provider-free source of ladders for the report viewer: when the
 * published report index (`regis.catalog.indexDirUrl`) is not wired — the
 * static-catalog demo path — the backend still needs the real tier rank so
 * `resolveLadders` doesn't fall back to alphabetical discovery. The array order
 * of `tiers` is the source of truth for rank (best→worst), mirroring
 * `IndexPlaybookEntry`.
 */
export function readConfigPlaybooks(
  config: RootConfigService,
): IndexPlaybookEntry[] {
  return (config.getOptionalConfigArray('regis.playbooks') ?? []).map(pb => {
    const entry: IndexPlaybookEntry = {
      id: pb.getString('id'),
      tiers: (pb.getOptionalConfigArray('tiers') ?? []).map(t => {
        const color = t.getOptionalString('color');
        return color ? { name: t.getString('name'), color } : { name: t.getString('name') };
      }),
    };
    const title = pb.getOptionalString('title');
    const version = pb.getOptionalString('version');
    const owner = pb.getOptionalString('owner');
    if (title !== undefined) entry.title = title;
    if (version !== undefined) entry.version = version;
    if (owner !== undefined) entry.owner = owner;
    return entry;
  });
}
