import type { Endpoint } from 'payload';

import { corsHeaders, trim } from '../utils';

export const createSubmitEndpoint = (): Endpoint => ({
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
});
