import { InfoCard } from '@backstage/core-components';
import { EntityRefLink, useEntity } from '@backstage/plugin-catalog-react';
import { REGIS_RELATION_ALIAS_OF } from '@regis/backstage-plugin-regis-common';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';

/** Lists the images that share this image's digest (the `aliasOf` relation). */
export function RegisAliasesCard() {
  const { entity } = useEntity();
  const targets = [
    ...new Set(
      (entity.relations ?? [])
        .filter(r => r.type === REGIS_RELATION_ALIAS_OF)
        .map(r => r.targetRef),
    ),
  ];

  if (targets.length === 0) return null;

  return (
    <InfoCard title="Aliases">
      <List dense disablePadding>
        {targets.map(ref => (
          <ListItem key={ref} disableGutters>
            <EntityRefLink entityRef={ref} />
          </ListItem>
        ))}
      </List>
    </InfoCard>
  );
}
