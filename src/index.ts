import { definePlugin, type CollectionConfig, type Config } from 'payload';

import { createAdminFeedbackCollection } from './collections/AdminFeedback';
import type { AdminFeedbackPluginOptions, ResolvedAdminFeedbackPluginOptions } from './types';

const PLUGIN_SLUG = 'payload-plugin-admin-feedback';
const DEFAULT_MEDIA_COLLECTION_SLUG = 'media';
const DEFAULT_ORDER = 10;

const isUploadCollection = (collection: CollectionConfig): boolean => Boolean(collection.upload);

const getCollectionLabel = (slug: string): string => `Collection "${slug}"`;

const resolveMediaCollectionSlug = (
  config: Config,
  options: Pick<ResolvedAdminFeedbackPluginOptions, 'mediaCollectionSlug' | 'strictMediaCollection'>,
): string => {
  const collections = config.collections || [];
  const targetCollection = collections.find((collection) => collection.slug === options.mediaCollectionSlug);

  if (!targetCollection) {
    if (!options.strictMediaCollection && options.mediaCollectionSlug !== DEFAULT_MEDIA_COLLECTION_SLUG) {
      const defaultCollection = collections.find(
        (collection) => collection.slug === DEFAULT_MEDIA_COLLECTION_SLUG,
      );
      if (defaultCollection && isUploadCollection(defaultCollection)) {
        return defaultCollection.slug;
      }
    }

    throw new Error(
      `${PLUGIN_SLUG}: ${getCollectionLabel(
        options.mediaCollectionSlug,
      )} was not found. Add an upload-enabled collection or set mediaCollectionSlug explicitly.`,
    );
  }

  if (!isUploadCollection(targetCollection)) {
    throw new Error(
      `${PLUGIN_SLUG}: ${getCollectionLabel(
        targetCollection.slug,
      )} is not upload-enabled. Configure an upload collection and set mediaCollectionSlug to that slug.`,
    );
  }

  return targetCollection.slug;
};

const resolveOptions = (
  pluginOptions: AdminFeedbackPluginOptions,
): ResolvedAdminFeedbackPluginOptions => ({
  enabled: true,
  allowScreenshotUpload: true,
  maxMessageLength: 3000,
  mediaCollectionSlug: DEFAULT_MEDIA_COLLECTION_SLUG,
  strictMediaCollection: true,
  ...pluginOptions,
  frontend: {
    enabled: true,
    include: [],
    ...pluginOptions.frontend,
  },
  screenshot: {
    enabled: true,
    maxFileSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    ...pluginOptions.screenshot,
  },
  headerImageUrl: pluginOptions.headerImageUrl,
});

export const adminFeedbackPlugin = definePlugin<AdminFeedbackPluginOptions>({
  slug: PLUGIN_SLUG,
  order: DEFAULT_ORDER,
  plugin: ({ config, ...pluginOptions }) => {
    const options = resolveOptions(pluginOptions);

    if (!options.enabled) {
      return config;
    }

    if (!options.emailTo || (Array.isArray(options.emailTo) && options.emailTo.length === 0)) {
      throw new Error('adminFeedbackPlugin requires emailTo option.');
    }

    const resolvedMediaCollectionSlug = resolveMediaCollectionSlug(config, options);
    const feedbackCollection = createAdminFeedbackCollection(options, resolvedMediaCollectionSlug);

    return {
      ...config,
      collections: [...(config.collections || []), feedbackCollection],
    };
  },
});

export type { AdminFeedbackPluginOptions } from './types';
export { pathMatchesAllowlist } from './client/routeMatcher';

declare module 'payload' {
  interface RegisteredPlugins {
    'payload-plugin-admin-feedback': AdminFeedbackPluginOptions;
  }
}
