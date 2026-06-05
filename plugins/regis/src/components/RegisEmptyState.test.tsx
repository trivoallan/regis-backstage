import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { RegisEmptyState } from './RegisEmptyState';

describe('RegisEmptyState', () => {
  it('renders the title', () => {
    render(<RegisEmptyState title="Nothing here." />);
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });
  it('renders the action when provided', () => {
    render(<RegisEmptyState title="Nothing." action={<button type="button">Do it</button>} />);
    expect(screen.getByText('Do it')).toBeInTheDocument();
  });
  it('renders no action node when omitted', () => {
    render(<RegisEmptyState title="Nothing." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
