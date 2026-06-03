import { createBackendModule } from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { createAddEntryAction } from './actions/addEntry';

/** Adds the Regis intake scaffolder action(s) to the scaffolder plugin. */
export const scaffolderModuleRegisIntake = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'regis-intake',
  register(env) {
    env.registerInit({
      deps: { scaffolder: scaffolderActionsExtensionPoint },
      async init({ scaffolder }) {
        scaffolder.addActions(createAddEntryAction());
      },
    });
  },
});
