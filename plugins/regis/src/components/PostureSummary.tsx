import type { Report, TrendBand } from '@regis/backstage-plugin-regis-common';
import { InfoCard } from '@backstage/core-components';
import { Box, Chip, Typography } from '@material-ui/core';
import { tierColor } from './format';
import { categoryScores } from './posture';

function barColor(score: number): string {
  if (score >= 90) return '#1e7d34';
  if (score >= 60) return '#e6a700';
  return '#c0392b';
}

/** Header card for the Regis tab: identity, tier, score, attribution, by-tag bars. */
export function PostureSummary(props: { report: Report; ladder: TrendBand[] }) {
  const { report, ladder } = props;
  const cats = categoryScores(report.rules_summary);
  const score = report.rules_summary?.score;
  const pb = report.playbooks?.[0];
  const tierNames = ladder.map(t => t.label).join(' → ');

  return (
    <InfoCard>
      <Box display="flex" alignItems="center" gridGap={12}>
        <Typography variant="h6" component="span">
          {report.request.repository}:{report.request.tag}
        </Typography>
        {report.tier && (
          <Chip
            size="small"
            label={report.tier}
            style={{ backgroundColor: tierColor(report.tier, ladder), color: '#fff' }}
          />
        )}
        {score !== undefined && (
          <Typography variant="h6" component="span" style={{ marginLeft: 'auto' }}>
            {score}/100
          </Typography>
        )}
      </Box>

      <Typography variant="caption" color="textSecondary" component="div" style={{ margin: '6px 0 14px' }}>
        {pb ? (
          <>
            Evaluated by playbook <strong>{pb.playbook_name}</strong>
            {pb.playbook_version ? ` v${pb.playbook_version}` : ''}
          </>
        ) : (
          'Playbook unknown'
        )}
        {ladder.length > 0 ? ` · ladder: ${tierNames}` : ''}
      </Typography>

      {cats.length > 0 && (
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
                    background: barColor(c.score),
                  }}
                />
              </div>
            </Box>
          ))}
        </Box>
      )}
    </InfoCard>
  );
}
