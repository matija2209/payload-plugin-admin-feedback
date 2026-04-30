import type { Endpoint } from 'payload';

import { corsHeaders } from '../utils';

export const createDeleteUploadEndpoint = (mediaCollectionSlug: string): Endpoint => ({
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
});
