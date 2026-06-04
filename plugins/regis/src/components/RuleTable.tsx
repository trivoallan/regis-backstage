import { useState } from 'react';
import { Table, type TableColumn, StatusError, StatusOK, StatusWarning } from '@backstage/core-components';
import { FormControlLabel, Switch } from '@material-ui/core';
import { categoryScores, sortRulesForTable, type Rule, type RulesSummary } from './posture';

function StatusCell(props: { rule: Rule }) {
  const s = props.rule.status;
  if (s === 'passed') return <StatusOK />;
  if (s === 'incomplete') return <StatusWarning />;
  return <StatusError />;
}

const columns: TableColumn<Rule>[] = [
  { title: 'Status', field: 'status', width: '90px', render: r => <StatusCell rule={r} /> },
  { title: 'Rule', field: 'description' },
  { title: 'Category', field: 'tags', render: r => (r.tags ?? []).join(', ') },
  { title: 'Priority', field: 'level', render: r => r.level ?? '—' },
  { title: 'Detail', field: 'message' },
];

/** Filterable rule table: failures-first by default, passing hidden until toggled. */
export function RuleTable(props: { rules: Rule[]; rulesSummary?: RulesSummary }) {
  const [showPassing, setShowPassing] = useState(false);
  const scores = categoryScores(props.rulesSummary);
  const ordered = sortRulesForTable(props.rules, scores);
  const data = showPassing ? ordered : ordered.filter(r => r.status !== 'passed');

  return (
    <Table
      title="Rules"
      columns={columns}
      data={data}
      options={{ paging: data.length > 15, pageSize: 15, padding: 'dense' }}
      components={{
        Toolbar: () => (
          <FormControlLabel
            style={{ margin: 8 }}
            control={
              <Switch
                checked={showPassing}
                onChange={e => setShowPassing(e.target.checked)}
                inputProps={{ 'aria-label': 'show passing rules' }}
              />
            }
            label="Show passing rules"
          />
        ),
      }}
    />
  );
}
