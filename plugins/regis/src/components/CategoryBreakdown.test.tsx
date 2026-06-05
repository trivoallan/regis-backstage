import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { CategoryBreakdown } from './CategoryBreakdown';

const rulesSummary = {
  score: 73,
  by_tag: {
    security: { rules: ['a', 'b'], passed_rules: ['a'], score: 65 },
    hygiene: { rules: ['c'], passed_rules: ['c'], score: 92 },
  },
} as any;

describe('CategoryBreakdown', () => {
  it('renders a labelled bar per category with its score', () => {
    render(<CategoryBreakdown rulesSummary={rulesSummary} />);
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('hygiene')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('renders nothing when there are no categories', () => {
    const { container } = render(<CategoryBreakdown rulesSummary={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
