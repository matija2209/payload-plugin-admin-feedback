import type { Payload } from 'payload';

import type { AdminFeedbackPluginOptions, FeedbackEmailData } from '../types';

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
  const createdBy = data.createdByName || data.createdByEmail || 'Unknown';
  
  let formattedDate = 'Unknown';
  try {
    formattedDate = data.createdAt ? new Date(data.createdAt).toLocaleString('sl-SI', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) : new Date().toLocaleString();
  } catch (e) {
    formattedDate = data.createdAt || 'Unknown';
  }

  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:34572';
  const adminUrl = data.id ? `${serverUrl}/admin/collections/admin-feedback/${data.id}` : null;

  const from = options.fromAddress
    ? `${options.fromName || options.fromLabel || 'Admin Feedback'} <${options.fromAddress}>`
    : undefined;

  const screenshotHtml = data.screenshotUrl && data.screenshotUrl !== '-'
    ? `
      <div style="margin-top: 24px;">
        <p style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #8b8b8b; font-weight: 600;">Screenshot Preview</p>
        <div style="border-radius: 12px; overflow: hidden; border: 1px solid #d6e3e7; background: #00455a;">
          <img src="${data.screenshotUrl}" alt="Feedback Screenshot" style="width: 100%; height: auto; display: block;" />
        </div>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #8b8b8b;">
          Full URL: <a href="${data.screenshotUrl}" style="color: #00455a; text-decoration: none;">${data.screenshotUrl}</a>
        </p>
      </div>
    `
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #353535; background-color: #f7f7f7; margin: 0; padding: 40px 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #d6e3e7; box-shadow: 0 12px 36px rgba(0, 69, 90, 0.08); }
          .header { background: #00455a; color: #fbfbfb; padding: 32px 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
          .content { padding: 36px 30px; }
          .section { margin-bottom: 24px; }
          .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8b8b8b; font-weight: 700; margin-bottom: 4px; }
          .value { font-size: 16px; color: #353535; margin: 0; }
          .message-box { background: #f1f7f8; border-left: 4px solid #00455a; padding: 16px 20px; border-radius: 8px; margin-top: 8px; }
          .footer { background: #fbfbfb; padding: 24px; text-align: center; border-top: 1px solid #e3edef; color: #8b8b8b; font-size: 13px; }
          .button { display: inline-block; background: #00455a; color: #fbfbfb !important; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Admin Feedback</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.8; font-size: 14px;">[${sourceLabel}] Received via Feedback Widget</p>
          </div>
          <div class="content">
            <div class="section">
              <p class="label">Message</p>
              <div class="message-box">
                <p class="value" style="white-space: pre-wrap;">${data.message}</p>
              </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 20px; border-top: 1px solid #e3edef; padding-top: 24px;">
              <div style="flex: 1; min-width: 200px; margin-bottom: 16px;">
                <p class="label">Page Path</p>
                <p class="value" style="word-break: break-all;">${data.pagePath}</p>
              </div>
              <div style="flex: 1; min-width: 200px; margin-bottom: 16px;">
                <p class="label">Created By</p>
                <p class="value">${createdBy}</p>
              </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 20px;">
              <div style="flex: 1; min-width: 200px; margin-bottom: 16px;">
                <p class="label">Selector</p>
                <p class="value" style="font-family: monospace; font-size: 13px;">${data.selector || '-'}</p>
              </div>
              <div style="flex: 1; min-width: 200px; margin-bottom: 16px;">
                <p class="label">Created At</p>
                <p class="value">${formattedDate}</p>
              </div>
            </div>

            ${data.selectedText && data.selectedText !== '-' ? `
              <div class="section">
                <p class="label">Selected Text</p>
                <p class="value" style="font-style: italic; color: #555;">"${data.selectedText}"</p>
              </div>
            ` : ''}

            ${screenshotHtml}

            ${adminUrl ? `
              <div style="text-align: center; margin-top: 32px;">
                <a href="${adminUrl}" class="button">View in Admin Panel</a>
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <p>This automated notification was sent from your Store Admin.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const emailMessage: any = {
    to,
    subject: `[${sourceLabel}] New feedback from ${createdBy}`,
    html,
  };

  if (from) {
    emailMessage.from = from;
  }

  await payload.sendEmail(emailMessage);
}
