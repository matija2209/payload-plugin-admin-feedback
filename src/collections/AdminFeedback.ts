import type { CollectionConfig } from 'payload';

import { createDeleteUploadEndpoint } from '../endpoints/deleteUpload';
import { createSubmitEndpoint } from '../endpoints/submit';
import { createUploadEndpoint } from '../endpoints/upload';
import { createAfterChangeHook } from '../hooks/afterChange';
import { createBeforeChangeHook } from '../hooks/beforeChange';
import type { ResolvedAdminFeedbackPluginOptions } from '../types';

export const createAdminFeedbackCollection = (
  options: ResolvedAdminFeedbackPluginOptions,
  mediaCollectionSlug: string,
): CollectionConfig => {
  return {
    slug: 'admin-feedback',
    admin: {
      group: {
        sl: 'System',
        en: 'System',
        ru: 'System',
      },
      useAsTitle: 'message',
      defaultColumns: ['createdAt', 'pagePath', 'status'],
    },
    access: {
      read: ({ req }) => Boolean(req.user),
      create: () => true,
      update: ({ req }) => Boolean(req.user),
      delete: ({ req }) => Boolean(req.user),
    },
    endpoints: [
      createSubmitEndpoint(),
      createUploadEndpoint(mediaCollectionSlug),
      createDeleteUploadEndpoint(mediaCollectionSlug),
    ],
    hooks: {
      beforeChange: [createBeforeChangeHook()],
      afterChange: [createAfterChangeHook(options)],
    },
    fields: [
      {
        name: 'message',
        type: 'textarea',
        required: true,
        maxLength: options.maxMessageLength || 3000,
      },
      {
        name: 'pagePath',
        type: 'text',
        required: true,
      },
      {
        name: 'selector',
        type: 'text',
      },
      {
        name: 'selectedText',
        type: 'text',
      },
      {
        name: 'screenshot',
        type: 'upload',
        relationTo: mediaCollectionSlug as never,
        required: false,
        admin: {
          description: 'Uploaded screenshot preview',
        },
      },
      {
        name: 'createdBy',
        type: 'relationship',
        relationTo: 'users',
        admin: {
          position: 'sidebar',
          readOnly: true,
        },
      },
      {
        name: 'status',
        type: 'select',
        defaultValue: 'new',
        options: [
          { label: 'New', value: 'new' },
          { label: 'Triaged', value: 'triaged' },
          { label: 'Resolved', value: 'resolved' },
        ],
        admin: {
          position: 'sidebar',
        },
      },
      {
        name: 'meta',
        type: 'json',
        admin: {
          readOnly: true,
        },
      },
    ],
  };
};
