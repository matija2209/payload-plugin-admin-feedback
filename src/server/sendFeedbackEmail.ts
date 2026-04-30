import type { Payload } from 'payload';

import type { AdminFeedbackPluginOptions, FeedbackEmailData } from '../types';

const line = (label: string, value: string): string => `<p><strong>${label}:</strong> ${value}</p>`;

export async function sendFeedbackEmail(
  payload: Payload,
  options: AdminFeedbackPluginOptions,
  data: FeedbackEmailData,
): Promise<void> {
  if (!options.emailTo) {
    return;
  }

  const to = Array.isArray(options.emailTo) ? options.emailTo : [options.emailTo];
  const sourceLabel = options.fromLabel || 'Admin Feedback';
  const selector = data.selector || '-';
  const selectedText = data.selectedText || '-';
  const screenshotUrl = data.screenshotUrl || '-';
  const createdBy = data.createdByName || data.createdByEmail || 'Unknown';
  const createdAt = data.createdAt || new Date().toISOString();

  await payload.sendEmail({
    to,
    subject: `[${sourceLabel}] New feedback from ${createdBy}`,
    html: [
      '<h2>New admin feedback</h2>',
      line('Message', data.message),
      line('Page path', data.pagePath),
      line('Selector', selector),
      line('Selected text', selectedText),
      line('Screenshot', screenshotUrl),
      line('Created by', createdBy),
      line('Created at', createdAt),
    ].join(''),
  });
}
