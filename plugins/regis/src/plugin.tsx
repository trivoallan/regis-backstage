import {
  ApiBlueprint,
  PageBlueprint,
  createApiFactory,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { EntityCardBlueprint } from '@backstage/plugin-catalog-react/alpha';
import TimelineIcon from '@material-ui/icons/Timeline';
import { isRegisAvailable } from '@regis/backstage-plugin-regis-common';
import {
  isComponentWithImageDeps,
  isContainerImage,
  isRegisPlaybook,
} from './components/imageRelations';
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

const rulesCard = EntityCardBlueprint.make({
  name: 'rules',
  params: {
    type: 'content',
    filter: isRegisAvailable,
    loader: () =>
      import('./components/RegisRulesCard').then(m => <m.RegisRulesCard />),
  },
});

const explorerPage = PageBlueprint.make({
  name: 'explorer',
  params: {
    path: '/',
    title: 'Portfolio',
    icon: <TimelineIcon />,
    routeRef: rootRouteRef,
    loader: () =>
      import('./components/RegisExplorerPage').then(m => <m.RegisExplorerPage />),
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

const playbookScorecard = EntityCardBlueprint.make({
  name: 'playbook-scorecard',
  params: {
    filter: isRegisPlaybook,
    loader: () =>
      import('./components/RegisPlaybookScorecard').then(m => (
        <m.RegisPlaybookScorecard />
      )),
  },
});

const playbookImagesCard = EntityCardBlueprint.make({
  name: 'playbook-images',
  params: {
    type: 'content',
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
    rulesCard,
    explorerPage,
    serviceImagesCard,
    playbookScorecard,
    playbookImagesCard,
    aliasesCard,
    trajectoryCard,
  ],
});
