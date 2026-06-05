import { Table, type TableColumn } from '@backstage/core-components';
import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import Link from '@material-ui/core/Link';
import type { ExploreImage, TrendBand } from '@regis/backstage-plugin-regis-common';
import { scoreBarColor, tierColor } from './format';
import { tierRank } from './rollup';

/** Worst tier first (highest rank index first), then ascending score. Non-mutating. */
function sortImagesWorstFirst(images: ExploreImage[], ladder: TrendBand[]): ExploreImage[] {
  const rank = tierRank(ladder);
  const rnk = (img: ExploreImage) =>
    (img.tier ? rank.get(img.tier) : undefined) ?? ladder.length;
  const score = (img: ExploreImage) => img.score ?? -1;
  return [...images].sort((a, b) => rnk(b) - rnk(a) || score(a) - score(b));
}

/** Scoped image list; clicking a row opens the quick-look. */
export function ImageList({
  images,
  ladder,
  onSelect,
}: {
  images: ExploreImage[];
  ladder: TrendBand[];
  onSelect: (imageRef: string) => void;
}) {
  const columns: TableColumn<ExploreImage>[] = [
    {
      title: 'Image',
      field: 'imageRef',
      render: row => (
        <Link component="button" type="button" onClick={() => onSelect(row.imageRef)}>
          {row.imageRef}
        </Link>
      ),
    },
    {
      title: 'Tier',
      field: 'tier',
      render: row =>
        row.tier ? (
          <Chip
            size="small"
            label={row.tier}
            style={{ backgroundColor: tierColor(row.tier, ladder), color: '#fff' }}
          />
        ) : (
          <>—</>
        ),
    },
    {
      title: 'Score',
      field: 'score',
      type: 'numeric',
      render: row => (
        <Box display="flex" alignItems="center" gridGap={8} justifyContent="flex-end">
          <span>{row.score ?? '—'}</span>
          {row.score !== undefined && (
            <div style={{ width: 60, height: 6, borderRadius: 3, background: '#eee', overflow: 'hidden' }}>
              <div style={{ width: `${row.score}%`, height: '100%', background: scoreBarColor(row.score) }} />
            </div>
          )}
        </Box>
      ),
    },
  ];
  return (
    <Table
      title={`${images.length} images · worst first`}
      columns={columns}
      data={sortImagesWorstFirst(images, ladder)}
      options={{ search: true, paging: images.length > 20, pageSize: 20, padding: 'dense' }}
    />
  );
}
