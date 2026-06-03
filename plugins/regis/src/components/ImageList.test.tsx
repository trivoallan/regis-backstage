import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { ImageList } from './ImageList';
import type { ExploreImage, TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [{ key: 'Gold', label: 'Gold', color: '#d4af37' }];
const images: ExploreImage[] = [
  { imageRef: 'r/a:1', tier: 'Gold', score: 100, system: 'shop' },
];

describe('ImageList', () => {
  it('lists images with a colored tier swatch and selects on row click', async () => {
    const onSelect = jest.fn();
    await renderInTestApp(<ImageList images={images} ladder={ladder} onSelect={onSelect} />);
    const cell = await screen.findByText('Gold');
    const swatch = cell.querySelector('[data-testid="tier-swatch"]');
    expect(swatch).toHaveStyle({ backgroundColor: '#d4af37' });
    fireEvent.click(screen.getByText('r/a:1'));
    expect(onSelect).toHaveBeenCalledWith('r/a:1');
  });
});
