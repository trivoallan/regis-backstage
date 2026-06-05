import { useEntity } from '@backstage/plugin-catalog-react';
import { RegisImagePostureCard } from './RegisImagePostureCard';
import { imageRefsFromRelations, playbookExploreLink } from './imageRelations';

/** Images the current Component depends on. */
export function RegisServiceImagesCard() {
  const { entity } = useEntity();
  return (
    <RegisImagePostureCard
      title="Images of this service"
      imageRefs={imageRefsFromRelations(entity, 'dependsOn')}
    />
  );
}

/** Images assessed against the current playbook. */
export function RegisPlaybookImagesCard() {
  const { entity } = useEntity();
  return (
    <RegisImagePostureCard
      title="Assessed images"
      imageRefs={imageRefsFromRelations(entity, 'dependencyOf')}
      exploreLink={playbookExploreLink(entity)}
    />
  );
}
