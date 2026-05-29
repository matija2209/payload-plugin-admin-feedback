import type { PayloadRequest } from 'payload';

import { extractTenantSlugFromPathname } from './extractTenantSlug';
import type { ResolvedAdminFeedbackPluginOptions } from '../types';

export const resolveFeedbackUploadTenantId = async (
  req: PayloadRequest,
  options: ResolvedAdminFeedbackPluginOptions,
  tenantSlugFromForm: string | null,
): Promise<number | null> => {
  const tenantConfig = options.tenant;

  if (!tenantConfig?.enabled) {
    return null;
  }

  let tenantSlug = tenantSlugFromForm;

  if (!tenantSlug && tenantConfig.pathMarkers?.length) {
    try {
      const url = new URL(req.url || '', `http://${req.headers.get('host') || 'localhost'}`);
      tenantSlug = extractTenantSlugFromPathname(url.pathname, tenantConfig.pathMarkers);
    } catch {
      tenantSlug = null;
    }
  }

  const collectionSlug = tenantConfig.collectionSlug || 'tenants';

  if (tenantSlug) {
    const found = await req.payload.find({
      collection: collectionSlug as 'tenants',
      where: { slug: { equals: tenantSlug } },
      limit: 1,
      overrideAccess: true,
    });

    const doc = found.docs[0];
    if (doc?.id != null) {
      return Number(doc.id);
    }
  }

  if (tenantConfig.resolveTenantId) {
    return tenantConfig.resolveTenantId({ req, tenantSlug: tenantSlug ?? null });
  }

  return null;
};
