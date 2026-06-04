import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { Box, Chip, Typography } from '@material-ui/core';
import { badgeClassColor, tierColor } from './format';
import { countByStatus } from './posture';
import { useReportAndLadder } from './useReportAndLadder';

/** Compact circular gauge filled to the 0-100 posture score. */
function Gauge(props: { score: number; color: string }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, props.score / 100));
  const offset = circ * (1 - ratio);
  return (
    <Box position="relative" width={96} height={96} flex="none">
      <svg
        viewBox="0 0 100 100"
        width={96}
        height={96}
        role="img"
        aria-label={`Posture score ${props.score} of 100`}
      >
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eee" strokeWidth={9} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={props.color}
          strokeWidth={9}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Typography variant="h5" component="span">
          {props.score}
        </Typography>
      </Box>
    </Box>
  );
}

/** Overview posture card: score gauge + tier + domain badges + counts. */
export function RegisScorecardCard() {
  const { value, loading, error } = useReportAndLadder();

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const { report, ladder } = value!;
  const rules = report.rules ?? [];
  const score = report.rules_summary?.score ?? 0;
  const counts = countByStatus(rules);
  const playbookName = report.playbooks?.[0]?.playbook_name;

  return (
    <InfoCard title="Regis posture">
      <Box display="flex" gridGap={18} alignItems="center" mb={1.5}>
        <Gauge score={score} color={tierColor(report.tier, ladder)} />
        <Box>
          {report.tier && (
            <Chip
              size="small"
              label={report.tier}
              style={{ backgroundColor: tierColor(report.tier, ladder), color: '#fff' }}
            />
          )}
          <Typography variant="body2" component="div">
            {counts.passed} passed · {counts.failed} failed · {counts.incomplete} incomplete
          </Typography>
        </Box>
      </Box>
      {(report.badges?.length ?? 0) > 0 && (
        <Box display="flex" flexWrap="wrap" gridGap={6} mb={1}>
          {report.badges!.map(b => (
            <Chip
              key={b.slug ?? b.scope}
              size="small"
              label={`${b.scope}${b.value ? ` · ${b.value}` : ''}`}
              style={{ backgroundColor: badgeClassColor(b.class), color: '#fff' }}
            />
          ))}
        </Box>
      )}
      {playbookName && (
        <Typography variant="caption" color="textSecondary">
          via {playbookName}
        </Typography>
      )}
    </InfoCard>
  );
}
