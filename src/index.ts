import type { Config, Plugin } from 'payload';

import { createAdminFeedbackCollection } from './collections/AdminFeedback';
import type { AdminFeedbackPluginOptions } from './types';

export const adminFeedbackPlugin =
  (pluginOptions: AdminFeedbackPluginOptions): Plugin =>
  (incomingConfig: Config): Config => {
    const defaultFrontend = {
      enabled: true,
      include: [],
    };

    const options: AdminFeedbackPluginOptions = {
      enabled: true,
      allowScreenshotUpload: true,
      maxMessageLength: 3000,
      ...pluginOptions,
      frontend: {
        ...defaultFrontend,
        ...pluginOptions.frontend,
      },
    };

    if (!options.enabled) {
      return incomingConfig;
    }

    if (!options.emailTo || (Array.isArray(options.emailTo) && options.emailTo.length === 0)) {
      throw new Error('adminFeedbackPlugin requires emailTo option.');
    }

    const feedbackCollection = createAdminFeedbackCollection(options);

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections || []), feedbackCollection],
    };
  };

export type { AdminFeedbackPluginOptions } from './types';
export { pathMatchesAllowlist } from './client/routeMatcher';
