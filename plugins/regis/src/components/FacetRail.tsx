import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import Typography from '@material-ui/core/Typography';
import type { ExploreGroupBy } from '@regis/backstage-plugin-regis-common';

export type FacetKey = 'system' | 'owner' | 'playbook' | 'tier';
export interface ExploreState {
  groupBy: ExploreGroupBy;
  filters: Partial<Record<FacetKey, string>>;
}
interface Facets {
  systems: string[];
  owners: string[];
  playbooks: string[];
  tiers: string[];
}

const GROUP_BYS: ExploreGroupBy[] = ['system', 'owner', 'playbook', 'tier'];
const FACET_DEFS: Array<{ key: FacetKey; label: string; from: keyof Facets }> = [
  { key: 'system', label: 'system', from: 'systems' },
  { key: 'owner', label: 'owner', from: 'owners' },
  { key: 'playbook', label: 'playbook', from: 'playbooks' },
  { key: 'tier', label: 'tier', from: 'tiers' },
];

export function FacetRail({
  state,
  facets,
  onChange,
}: {
  state: ExploreState;
  facets: Facets;
  onChange: (next: ExploreState) => void;
}) {
  const setGroupBy = (groupBy: ExploreGroupBy) => onChange({ ...state, groupBy });
  const addFilter = (key: FacetKey, value: string) =>
    onChange({ ...state, filters: { ...state.filters, [key]: value } });
  const removeFilter = (key: FacetKey) => {
    const filters = { ...state.filters };
    delete filters[key];
    onChange({ ...state, filters });
  };

  return (
    <Box display="flex" flexDirection="column" gridGap={16}>
      <FormControl fullWidth>
        <InputLabel id="regis-groupby">Group by</InputLabel>
        <Select
          labelId="regis-groupby"
          value={state.groupBy}
          onChange={e => setGroupBy(e.target.value as ExploreGroupBy)}
        >
          {GROUP_BYS.map(g => (
            <MenuItem key={g} value={g}>{g}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box>
        <Typography variant="overline" color="textSecondary">Active filters</Typography>
        <Box display="flex" flexWrap="wrap" gridGap={6}>
          {Object.entries(state.filters).map(([key, value]) => (
            <Chip
              key={key}
              label={`${key}: ${value}`}
              onDelete={() => removeFilter(key as FacetKey)}
              deleteIcon={<span aria-label={`remove ${key} filter`}>✕</span>}
              size="small"
            />
          ))}
          {Object.keys(state.filters).length === 0 && (
            <Typography variant="caption" color="textSecondary">none</Typography>
          )}
        </Box>
      </Box>

      {FACET_DEFS.filter(f => state.filters[f.key] === undefined).map(f => {
        const options = facets[f.from];
        if (options.length === 0) return null;
        return (
          <FormControl fullWidth key={f.key}>
            <InputLabel id={`regis-facet-${f.key}`}>{`Filter by ${f.label}`}</InputLabel>
            <Select
              labelId={`regis-facet-${f.key}`}
              value=""
              onChange={e => addFilter(f.key, e.target.value as string)}
            >
              {options.map(o => (
                <MenuItem key={o} value={o}>{o}</MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      })}
    </Box>
  );
}
