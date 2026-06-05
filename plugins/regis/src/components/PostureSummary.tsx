import type { Report, TrendBand } from '@regis/backstage-plugin-regis-common';
import { InfoCard } from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { Box, Chip, Typography } from '@material-ui/core';
import { scoreBarColor, tierColor } from './format';
import { categoryScores } from './posture';

/** Header card for the Regis tab: identity, tier, score, attribution, by-tag bars. */
export function PostureSummary(props: { report: Report; ladder: TrendBand[]; playbookRef?: string }) {
  const { report, ladder, playbookRef } = props;
  const cats = categoryScores(report.rules_summary);
  const score = report.rules_summary?.score;
  const pb = report.playbooks?.[0];
  const tierNames = ladder.map(t => t.label).join(' → ');
  const scanned = report.request.timestamp?.slice(0, 10);

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
            Evaluated by playbook{' '}
            {playbookRef ? (
              <EntityRefLink entityRef={playbookRef}>{pb.playbook_name}</EntityRefLink>
            ) : (
              <strong>{pb.playbook_name}</strong>
            )}
            {pb.playbook_version ? ` v${pb.playbook_version}` : ''}
          </>
        ) : (
          'Playbook unknown'
        )}
        {ladder.length > 0 ? ` · ladder: ${tierNames}` : ''}
        {scanned ? ` · scanned ${scanned}` : ''}
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
                    background: scoreBarColor(c.score),
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
