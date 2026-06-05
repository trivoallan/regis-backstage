import { isValidElement, type ReactNode } from 'react';
import { SidebarBody } from './Sidebar';

/** Walk a returned element tree (unrendered) for the first element matching pred. */
function findElement(
  node: ReactNode,
  pred: (props: Record<string, unknown>) => boolean,
): boolean {
  if (Array.isArray(node)) return node.some(n => findElement(n, pred));
  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    return pred(props) || findElement(props.children as ReactNode, pred);
  }
  return false;
}

/** Minimal stub of the NavItemsCollection passed by NavContentBlueprint. */
function stubNav() {
  const taken: string[] = [];
  let restCalled = false;
  const navItems = {
    withComponent: () => ({
      take: (id: string) => {
        taken.push(id);
        return null;
      },
      rest: () => {
        restCalled = true;
        return null;
      },
    }),
  };
  return { navItems, taken, get restCalled() { return restCalled; } };
}

describe('SidebarBody (curated nav)', () => {
  it('takes only the image-management pages and never calls rest()', () => {
    const s = stubNav();
    // Invoke the component function directly; the nav.take(...) calls run while
    // building the element tree. We do not render the result.
    const renderSidebarBody = SidebarBody;
    renderSidebarBody({ navItems: s.navItems as any });
    expect(s.taken).toEqual([
      'page:search',
      'page:catalog',
      'page:scaffolder',
      'page:user-settings',
    ]);
    expect(s.restCalled).toBe(false);
  });

  it('renders an explicit Portfolio item pointing to the home', () => {
    const s = stubNav();
    const renderSidebarBody = SidebarBody;
    const tree = renderSidebarBody({ navItems: s.navItems as any });
    expect(
      findElement(tree, p => p.text === 'Portfolio' && p.to === '/'),
    ).toBe(true);
  });
});
