import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { Progress } from '@backstage/core-components';
import { catalogApiRef, EntityRefLink } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import Drawer from '@material-ui/core/Drawer';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';
import CloseIcon from '@material-ui/icons/Close';
import {
  REGIS_ANNOTATION_IMAGE_REF,
  type ReportHistory,
  type TrendBand,
} from '@regis/backstage-plugin-regis-common';
import { regisApiRef } from '../api/RegisApi';
import { tierColor } from './format';
import { Sparkline } from './Sparkline';

/** Right-hand quick-look for one image: tier/score + trajectory + link to the entity page. */
export function QuickLookPanel({
  imageRef,
  tier,
  score,
  ladder,
  onClose,
}: {
  imageRef: string;
  tier?: string | null;
  score?: number;
  ladder: TrendBand[];
  onClose: () => void;
}) {
  const api = useApi(regisApiRef);
  const catalogApi = useApi(catalogApiRef);

  // The catalog entity name is NOT derivable from the image ref — it differs
  // between the demo catalog and the entity provider — so resolve the real
  // entity by its `regis.io/image-ref` annotation. That ref is then used both
  // for the trajectory (getHistory) and the "open full page" link.
  const { value, loading } = useAsync(async () => {
    const { items } = await catalogApi.getEntities({
      filter: {
        kind: 'Resource',
        [`metadata.annotations.${REGIS_ANNOTATION_IMAGE_REF}`]: imageRef,
      },
      fields: ['kind', 'metadata.name', 'metadata.namespace'],
    });
    const entity = items[0];
    const entityRef = entity ? stringifyEntityRef(entity) : undefined;
    const history: ReportHistory | undefined = entityRef
      ? await api.getHistory(entityRef)
      : undefined;
    return { entityRef, history };
  }, [imageRef]);

  const entityRef = value?.entityRef;
  const history = value?.history;

  let trajectory: JSX.Element;
  if (loading) trajectory = <Progress />;
  else if (history) trajectory = <Sparkline history={history} ladder={ladder} />;
  else trajectory = <Typography variant="body2">No history.</Typography>;

  return (
    <Drawer anchor="right" open onClose={onClose} variant="temporary">
      <Box width={320} p={2} display="flex" flexDirection="column" gridGap={12} role="region" aria-label="image quick look">
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" noWrap>{imageRef}</Typography>
          <IconButton size="small" aria-label="close quick look" onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        {tier && (
          <Chip label={`${tier}${score !== undefined ? ` · ${score}` : ''}`} style={{ backgroundColor: tierColor(tier, ladder), color: '#fff', alignSelf: 'flex-start' }} />
        )}
        <Typography variant="overline" color="textSecondary">Trajectory</Typography>
        {trajectory}
        {entityRef ? (
          <EntityRefLink entityRef={entityRef}>Open full page ↗</EntityRefLink>
        ) : (
          !loading && (
            <Typography variant="body2" color="textSecondary">
              Not in the catalog.
            </Typography>
          )
        )}
      </Box>
    </Drawer>
  );
}
