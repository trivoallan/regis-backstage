import { Table, type TableColumn } from '@backstage/core-components';
import Box from '@material-ui/core/Box';
import Link from '@material-ui/core/Link';
import type { ExploreImage, TrendBand } from '@regis/backstage-plugin-regis-common';
import { tierColor } from './format';

function TierCell({ tier, ladder }: { tier?: string | null; ladder: TrendBand[] }) {
  return (
    <Box component="span" display="inline-flex" alignItems="center" gridGap={6}>
      <Box
        component="span"
        data-testid="tier-swatch"
        width={10}
        height={10}
        borderRadius={2}
        style={{ backgroundColor: tierColor(tier, ladder) }}
      />
      {tier ?? '—'}
    </Box>
  );
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
    { title: 'Tier', field: 'tier', render: row => <TierCell tier={row.tier} ladder={ladder} /> },
    { title: 'Score', field: 'score', type: 'numeric' },
  ];
  return (
    <Table
      title={`${images.length} images`}
      columns={columns}
      data={images}
      options={{ search: true, paging: images.length > 20, pageSize: 20, padding: 'dense' }}
    />
  );
}
