import type { CollectionBeforeChangeHook } from 'payload';

import { trim } from '../utils';

export const createBeforeChangeHook = (): CollectionBeforeChangeHook => {
  return ({ data, req, operation }) => {
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
  };
};
