import type { CollectionAfterChangeHook } from 'payload';

import { sendFeedbackEmail } from '../server/sendFeedbackEmail';
import type { ResolvedAdminFeedbackPluginOptions } from '../types';

export const createAfterChangeHook = (
  options: ResolvedAdminFeedbackPluginOptions,
): CollectionAfterChangeHook => {
  return async ({ doc, operation, req }) => {
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
  };
};
