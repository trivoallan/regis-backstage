import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { ImagePostureTable } from './ImagePostureTable';
import { RegisEmptyState } from './RegisEmptyState';
import { RegisImagePostureCard } from './RegisImagePostureCard';
import { imageRefsFromRelations, playbookExploreLink } from './imageRelations';
import { useImageReports } from './useImageReports';

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

/** Full-width table of the images assessed against the current playbook. */
export function RegisPlaybookImagesCard() {
  const { entity } = useEntity();
  const imageRefs = imageRefsFromRelations(entity, 'dependencyOf');
  const { rows, ladder, loading, error } = useImageReports(imageRefs);
  const exploreLink = playbookExploreLink(entity);
  const deepLink = exploreLink
    ? { title: 'View in explorer', link: exploreLink }
    : undefined;

  if (loading) {
    return (
      <InfoCard title="Assessed images">
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title="Assessed images">
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }
  if (rows.length === 0) {
    return (
      <InfoCard title="Assessed images">
        <RegisEmptyState title="No Regis-tracked images." />
      </InfoCard>
    );
  }

  return (
    <InfoCard title="Assessed images" deepLink={deepLink}>
      <ImagePostureTable rows={rows} ladder={ladder} />
    </InfoCard>
  );
}
