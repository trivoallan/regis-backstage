import {
  Sidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarSpace,
} from '@backstage/core-components';
import {
  NavContentBlueprint,
  NavContentNavItems,
} from '@backstage/plugin-app-react';
import { SidebarLogo } from './SidebarLogo';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import TimelineIcon from '@material-ui/icons/Timeline';
import { SidebarSearchModal } from '@backstage/plugin-search';
import { UserSettingsSignInAvatar } from '@backstage/plugin-user-settings';

/**
 * Curated sidebar body: only the image-management surfaces (Portfolio, Catalog,
 * Create, Search, Settings). Plugins stay loaded — entity tabs and direct URLs
 * are unaffected; this just trims the nav. Exported for unit testing.
 */
export function SidebarBody({ navItems }: { navItems: NavContentNavItems }) {
  const nav = navItems.withComponent(item => (
    <SidebarItem icon={() => item.icon} to={item.href} text={item.title} />
  ));

  nav.take('page:search'); // search is the modal below, not a nav page

  return (
    <Sidebar>
      <SidebarLogo />
      <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
        <SidebarSearchModal />
      </SidebarGroup>
      <SidebarDivider />
      <SidebarGroup label="Menu" icon={<MenuIcon />}>
        <SidebarItem icon={TimelineIcon} to="/" text="Portfolio" />
        {nav.take('page:catalog')}
        {nav.take('page:scaffolder')}
      </SidebarGroup>
      <SidebarSpace />
      <SidebarDivider />
      <SidebarGroup
        label="Settings"
        icon={<UserSettingsSignInAvatar />}
        to="/settings"
      >
        {nav.take('page:user-settings')}
      </SidebarGroup>
    </Sidebar>
  );
}

export const SidebarContent = NavContentBlueprint.make({
  params: { component: SidebarBody },
});
