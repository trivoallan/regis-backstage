import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Box, Typography } from '@material-ui/core';
import { REGIS_ANNOTATION_PLAYBOOK_ID } from '@regis/backstage-plugin-regis-common';
import { playbookLadder } from './format';
import { imageRefsFromRelations } from './imageRelations';
import { PostureRollup } from './PostureRollup';
import { TierLadder } from './TierLadder';
import { useImageReports } from './useImageReports';

/** Playbook synthesis: the defined tier ladder + a posture rollup of assessed images. */
export function RegisPlaybookScorecard() {
  const { entity } = useEntity();
  const imageRefs = imageRefsFromRelations(entity, 'dependencyOf');
  const { rows, ladder, playbooks, loading, error } = useImageReports(imageRefs);

  if (loading) {
    return (
      <InfoCard title="Playbook posture">
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title="Playbook posture">
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }

  const id = entity.metadata.annotations?.[REGIS_ANNOTATION_PLAYBOOK_ID];
  const tiers = playbookLadder(playbooks, id);

  return (
    <InfoCard title="Playbook posture">
      <Box mb={1.5}>
        <TierLadder tiers={tiers} />
      </Box>
      <PostureRollup rows={rows} ladder={ladder} />
      <Typography variant="caption" color="textSecondary">
        {rows.length > 0
          ? `${rows.length} assessed image${rows.length === 1 ? '' : 's'}`
          : 'No assessed images yet'}
      </Typography>
    </InfoCard>
  );
}
