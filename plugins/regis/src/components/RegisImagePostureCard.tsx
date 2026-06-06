import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { ImagePostureTable } from './ImagePostureTable';
import { PostureRollup } from './PostureRollup';
import { RegisEmptyState } from './RegisEmptyState';
import { useImageReports } from './useImageReports';

/** Posture summary of a given set of image entityRefs (used by the service card). */
export function RegisImagePostureCard(props: {
  title: string;
  imageRefs: string[];
  exploreLink?: string;
}) {
  const { title, imageRefs, exploreLink } = props;
  const { rows, ladder, loading, error } = useImageReports(imageRefs);

  if (loading) {
    return (
      <InfoCard title={title}>
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title={title}>
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }
  if (rows.length === 0) {
    return (
      <InfoCard title={title}>
        <RegisEmptyState title="No Regis-tracked images." />
      </InfoCard>
    );
  }

  const deepLink = exploreLink
    ? { title: 'View in explorer', link: exploreLink }
    : undefined;

  return (
    <InfoCard title={title} deepLink={deepLink}>
      <PostureRollup rows={rows} ladder={ladder} />
      <ImagePostureTable rows={rows} ladder={ladder} />
    </InfoCard>
  );
}
