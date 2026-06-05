import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { ImageList } from './ImageList';
import type { ExploreImage, TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const images: ExploreImage[] = [
  { imageRef: 'r/gold:1', tier: 'Gold', score: 95, system: 'shop' },
  { imageRef: 'r/bronze:1', tier: 'Bronze', score: 55, system: 'shop' },
  { imageRef: 'r/silver:1', tier: 'Silver', score: 80, system: 'shop' },
];

describe('ImageList', () => {
  it('sorts worst-first and renders a colored tier chip', async () => {
    await renderInTestApp(<ImageList images={images} ladder={ladder} onSelect={jest.fn()} />);
    const rows = await screen.findAllByText(/r\/(gold|silver|bronze):1/);
    expect(rows[0]).toHaveTextContent('r/bronze:1');
    expect(rows[2]).toHaveTextContent('r/gold:1');
    const chip = (await screen.findByText('Bronze')).closest('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveStyle({ backgroundColor: '#cd7f32' });
  });

  it('selects on row click', async () => {
    const onSelect = jest.fn();
    await renderInTestApp(<ImageList images={images} ladder={ladder} onSelect={onSelect} />);
    fireEvent.click(await screen.findByText('r/bronze:1'));
    expect(onSelect).toHaveBeenCalledWith('r/bronze:1');
  });
});
