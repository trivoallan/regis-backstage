import {
  ApiBlueprint,
  PageBlueprint,
  createApiFactory,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import { isRegisAvailable } from '@regis/backstage-plugin-regis-common';
import { regisApiRef } from './api/RegisApi';
import { RegisClient } from './api/RegisClient';
import { rootRouteRef } from './routes';

const regisApi = ApiBlueprint.make({
  params: define =>
    define(
      createApiFactory({
        api: regisApiRef,
        deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
        factory: ({ discoveryApi, fetchApi }) =>
          new RegisClient({ discoveryApi, fetchApi }),
      }),
    ),
});

const scorecardCard = EntityCardBlueprint.make({
  name: 'scorecard',
  params: {
    filter: isRegisAvailable,
    loader: () =>
      import('./components/RegisScorecardCard').then(m => (
        <m.RegisScorecardCard />
      )),
  },
});

const reportTab = EntityContentBlueprint.make({
  name: 'report',
  params: {
    path: 'regis',
    title: 'Regis',
    filter: isRegisAvailable,
    loader: () =>
      import('./components/RegisTabContent').then(m => <m.RegisTabContent />),
  },
});

const catalogPage = PageBlueprint.make({
  params: {
    path: '/regis',
    routeRef: rootRouteRef,
    loader: () =>
      import('./components/RegisCatalogPage').then(m => <m.RegisCatalogPage />),
  },
});

export const regisPlugin = createFrontendPlugin({
  pluginId: 'regis',
  extensions: [regisApi, scorecardCard, reportTab, catalogPage],
});
