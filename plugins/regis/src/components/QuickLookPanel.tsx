import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { Progress } from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import Drawer from '@material-ui/core/Drawer';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';
import CloseIcon from '@material-ui/icons/Close';
import { slugForImageRef, type TrendBand } from '@regis/backstage-plugin-regis-common';
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
  // The provider mints image Resources named slugForImageRef(imageRef) in the
  // 'default' namespace — derive the entity ref to link to the full page.
  const entityRef = `resource:default/${slugForImageRef(imageRef)}`;
  const { value: history, loading } = useAsync(() => api.getHistory(entityRef), [entityRef]);

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
        <EntityRefLink entityRef={entityRef}>Open full page ↗</EntityRefLink>
      </Box>
    </Drawer>
  );
}
