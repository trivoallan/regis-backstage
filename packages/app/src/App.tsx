import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { navModule } from './modules/nav';
import regisPlugin from '@regis/backstage-plugin-regis';

export default createApp({
  features: [catalogPlugin, navModule, regisPlugin],
});
