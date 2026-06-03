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
import TimelineIcon from '@material-ui/icons/Timeline';
import { isRegisAvailable } from '@regis/backstage-plugin-regis-common';
import {
  isComponentWithImageDeps,
  isContainerImage,
  isRegisPlaybook,
} from './components/imageRelations';
import { regisApiRef } from './api/RegisApi';
import { RegisClient } from './api/RegisClient';
import { rootRouteRef, portfolioRouteRef } from './routes';

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

const portfolioTrendsPage = PageBlueprint.make({
  name: 'portfolio-trends',
  params: {
    path: '/regis-portfolio',
    title: 'Portfolio Trends',
    icon: <TimelineIcon />,
    routeRef: portfolioRouteRef,
    loader: () =>
      import('./components/RegisPortfolioTrendsPage').then(m => (
        <m.RegisPortfolioTrendsPage />
      )),
  },
});

const serviceImagesCard = EntityCardBlueprint.make({
  name: 'service-images',
  params: {
    filter: isComponentWithImageDeps,
    loader: () =>
      import('./components/RegisRelatedImagesCards').then(m => (
        <m.RegisServiceImagesCard />
      )),
  },
});

const playbookImagesCard = EntityCardBlueprint.make({
  name: 'playbook-images',
  params: {
    filter: isRegisPlaybook,
    loader: () =>
      import('./components/RegisRelatedImagesCards').then(m => (
        <m.RegisPlaybookImagesCard />
      )),
  },
});

const aliasesCard = EntityCardBlueprint.make({
  name: 'aliases',
  params: {
    filter: isContainerImage,
    loader: () =>
      import('./components/RegisAliasesCard').then(m => <m.RegisAliasesCard />),
  },
});

const trajectoryCard = EntityCardBlueprint.make({
  name: 'trajectory',
  params: {
    filter: isContainerImage,
    loader: () =>
      import('./components/RegisTrajectoryCard').then(m => (
        <m.RegisTrajectoryCard />
      )),
  },
});

export const regisPlugin = createFrontendPlugin({
  pluginId: 'regis',
  extensions: [
    regisApi,
    scorecardCard,
    reportTab,
    catalogPage,
    portfolioTrendsPage,
    serviceImagesCard,
    playbookImagesCard,
    aliasesCard,
    trajectoryCard,
  ],
});
