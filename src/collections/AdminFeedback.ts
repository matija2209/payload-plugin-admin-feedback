import type { CollectionConfig } from 'payload';

import { sendFeedbackEmail } from '../server/sendFeedbackEmail';
import type { ResolvedAdminFeedbackPluginOptions } from '../types';

const trim = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : null;
};

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
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (!data) {
          return data;
        }

        const nextData = { ...data };
        const message = trim(nextData.message);
        const pagePath = trim(nextData.pagePath);

        nextData.message = message || '';
        nextData.pagePath = pagePath || '/';
        nextData.selector = trim(nextData.selector);
        nextData.selectedText = trim(nextData.selectedText);

        const existingMeta =
          typeof nextData.meta === 'object' && nextData.meta !== null
            ? (nextData.meta as Record<string, unknown>)
            : {};

        nextData.meta = {
          ...existingMeta,
          createdAt: new Date().toISOString(),
          userAgent: trim(existingMeta.userAgent),
          locale: trim(existingMeta.locale),
          viewport: trim(existingMeta.viewport),
        };

        if (operation === 'create' && req.user && !nextData.createdBy) {
          nextData.createdBy = req.user.id;
        }

        return nextData;
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') {
          return doc;
        }

        const screenshotDoc =
          typeof doc.screenshot === 'object' && doc.screenshot !== null
            ? (doc.screenshot as Record<string, unknown>)
            : null;
        const createdByDoc =
          typeof doc.createdBy === 'object' && doc.createdBy !== null
            ? (doc.createdBy as Record<string, unknown>)
            : null;
        const screenshotUrl =
          typeof screenshotDoc?.url === 'string'
            ? screenshotDoc.url
            : typeof screenshotDoc?.filename === 'string'
              ? screenshotDoc.filename
              : null;

        try {
          await sendFeedbackEmail(req.payload, options, {
            message: String(doc.message || ''),
            pagePath: String(doc.pagePath || '/'),
            selector: typeof doc.selector === 'string' ? doc.selector : null,
            selectedText: typeof doc.selectedText === 'string' ? doc.selectedText : null,
            screenshotUrl,
            createdByEmail:
              createdByDoc && typeof createdByDoc.email === 'string' ? createdByDoc.email : null,
            createdByName:
              createdByDoc && typeof createdByDoc.first_name === 'string'
                ? `${createdByDoc.first_name} ${String(createdByDoc.last_name || '')}`.trim()
                : null,
            createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : null,
          });
        } catch (error) {
          req.payload.logger.error(
            `Failed to send admin feedback email: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }

        return doc;
      },
    ],
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
