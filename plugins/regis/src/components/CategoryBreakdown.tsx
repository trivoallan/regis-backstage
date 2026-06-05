import { Box, Typography } from '@material-ui/core';
import { categoryScores, type RulesSummary } from './posture';
import { scoreBarColor } from './format';

/** Per-category (per-tag) score bars, worst category first. */
export function CategoryBreakdown(props: { rulesSummary?: RulesSummary }) {
  const cats = categoryScores(props.rulesSummary);
  if (cats.length === 0) return null;

  return (
    <Box display="grid" gridTemplateColumns="1fr 1fr" gridGap="10px 24px">
      {cats.map(c => (
        <Box key={c.tag}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="caption">{c.tag}</Typography>
            <Typography variant="caption">{c.score}%</Typography>
          </Box>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: '#eee',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${c.score}%`,
                height: '100%',
                background: scoreBarColor(c.score),
              }}
            />
          </div>
        </Box>
      ))}
    </Box>
  );
}
