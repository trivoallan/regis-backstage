import { SidebarBody } from './Sidebar';

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
      'page:regis',
      'page:catalog',
      'page:scaffolder',
      'page:user-settings',
    ]);
    expect(s.restCalled).toBe(false);
  });
});
