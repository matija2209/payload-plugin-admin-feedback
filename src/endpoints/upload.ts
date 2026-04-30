import type { Endpoint } from 'payload';

import { corsHeaders } from '../utils';

export const createUploadEndpoint = (mediaCollectionSlug: string): Endpoint => ({
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
});
