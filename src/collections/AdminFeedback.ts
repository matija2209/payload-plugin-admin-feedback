import type { CollectionConfig } from 'payload';
import type { PayloadRequest } from 'payload';
import { headersWithCors } from 'payload';

import { sendFeedbackEmail } from '../server/sendFeedbackEmail';
import type { ResolvedAdminFeedbackPluginOptions } from '../types';

const trim = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : null;
};

const corsHeaders = (req: PayloadRequest, init?: HeadersInit): Headers =>
  headersWithCors({
    headers: new Headers(init),
    req: req as unknown as Request,
  });

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
      {
        path: '/submit',
        method: 'post',
        handler: async (req) => {
          try {
            const body = await (req as unknown as Request).json();
            const message = trim(body?.message);
            if (!message) {
              return Response.json(
                { success: false, error: 'Message is required.' },
                { status: 400, headers: corsHeaders(req) },
              );
            }

            const doc = await req.payload.create({
              collection: 'admin-feedback',
              data: {
                message,
                pagePath: trim(body?.pagePath) || '/',
                selector: trim(body?.selector) || undefined,
                selectedText: trim(body?.selectedText) || undefined,
                screenshot: body?.screenshotId || undefined,
                createdBy: req.user?.id,
                meta: {
                  createdAt: new Date().toISOString(),
                  userAgent: trim(body?.meta?.userAgent),
                  locale: trim(body?.meta?.locale),
                  viewport: trim(body?.meta?.viewport),
                },
              },
            });

            return Response.json(
              { success: true, id: doc.id },
              { headers: corsHeaders(req) },
            );
          } catch (error) {
            return Response.json(
              { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
              { status: 500, headers: corsHeaders(req) },
            );
          }
        },
      },
      {
        path: '/upload',
        method: 'post',
        handler: async (req) => {
          try {
            if (!req.user) {
              return Response.json(
                { success: false, error: 'Unauthorized' },
                { status: 401, headers: corsHeaders(req) },
              );
            }

            const formData = await (req as unknown as Request).formData();
            const file = formData.get('file');
            const altRaw = formData.get('alt');
            const alt = typeof altRaw === 'string' ? altRaw.trim() : '';

            if (!(file instanceof File)) {
              return Response.json(
                { success: false, error: 'Missing file.' },
                { status: 400, headers: corsHeaders(req) },
              );
            }

            if (file.size === 0) {
              return Response.json(
                { success: false, error: 'File is empty.' },
                { status: 400, headers: corsHeaders(req) },
              );
            }

            const media = await req.payload.create({
              collection: mediaCollectionSlug as 'media',
              data: {
                alt: alt || file.name,
              },
              file: {
                data: Buffer.from(await file.arrayBuffer()),
                mimetype: file.type || 'application/octet-stream',
                name: file.name,
                size: file.size,
              },
            });

            return Response.json(
              { success: true, mediaId: Number(media.id) },
              { headers: corsHeaders(req) },
            );
          } catch (error) {
            return Response.json(
              { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
              { status: 500, headers: corsHeaders(req) },
            );
          }
        },
      },
      {
        path: '/upload/:id',
        method: 'delete',
        handler: async (req) => {
          try {
            if (!req.user) {
              return Response.json(
                { success: false, error: 'Unauthorized' },
                { status: 401, headers: corsHeaders(req) },
              );
            }

            const id = req.routeParams?.id;
            if (!id) {
              return Response.json(
                { success: false, error: 'Missing media ID.' },
                { status: 400, headers: corsHeaders(req) },
              );
            }

            await req.payload.delete({
              collection: mediaCollectionSlug as 'media',
              id: id as string,
            });

            return Response.json(
              { success: true },
              { headers: corsHeaders(req) },
            );
          } catch (error) {
            return Response.json(
              { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
              { status: 500, headers: corsHeaders(req) },
            );
          }
        },
      },
    ],
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
            id: doc.id,
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
