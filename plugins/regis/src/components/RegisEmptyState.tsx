import type { ReactNode } from 'react';
import { Box, Typography } from '@material-ui/core';

/** Consistent, lightweight empty state: a muted title + an optional action. */
export function RegisEmptyState(props: { title: string; action?: ReactNode }) {
  return (
    <Box textAlign="center" py={2}>
      <Typography variant="body2" color="textSecondary">
        {props.title}
      </Typography>
      {props.action && <Box mt={1}>{props.action}</Box>}
    </Box>
  );
}
