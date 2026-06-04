import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { FacetRail } from './FacetRail';

const facets = { systems: ['shop', 'bank'], owners: ['o1'], playbooks: ['default'], tiers: ['Gold'] };

describe('FacetRail', () => {
  it('shows active filters as deletable chips and removes one on delete', async () => {
    const onChange = jest.fn();
    await renderInTestApp(
      <FacetRail
        state={{ groupBy: 'owner', filters: { system: 'shop' } }}
        facets={facets}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('system: shop')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('remove system filter'));
    expect(onChange).toHaveBeenCalledWith({ groupBy: 'owner', filters: {} });
  });

  it('changes the group-by via the selector', async () => {
    const onChange = jest.fn();
    await renderInTestApp(
      <FacetRail state={{ groupBy: 'system', filters: {} }} facets={facets} onChange={onChange} />,
    );
    fireEvent.mouseDown(screen.getByLabelText('Group by'));
    fireEvent.click(await screen.findByRole('option', { name: 'owner' }));
    expect(onChange).toHaveBeenCalledWith({ groupBy: 'owner', filters: {} });
  });

  it('adds a facet value from the add-facet selector', async () => {
    const onChange = jest.fn();
    await renderInTestApp(
      <FacetRail state={{ groupBy: 'owner', filters: {} }} facets={facets} onChange={onChange} />,
    );
    fireEvent.mouseDown(screen.getByLabelText('Filter by system'));
    fireEvent.click(await screen.findByRole('option', { name: 'bank' }));
    expect(onChange).toHaveBeenCalledWith({ groupBy: 'owner', filters: { system: 'bank' } });
  });
});
