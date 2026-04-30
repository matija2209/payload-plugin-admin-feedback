'use client';

import React from 'react';

import { FeedbackWidget } from './FeedbackWidget';

export function AdminFeedbackWidget() {
  return (
    <FeedbackWidget
      title="Admin feedback"
      submitLabel="Send"
      uploadLabel="Upload image"
      allowScreenshotUpload
      onSubmit={async (payload) => {
        const response = await fetch('/api/admin-feedback/submit', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const result = (await response.json()) as { success: boolean; error?: string };
        if (!result.success) {
          return { success: false as const, error: result.error || 'Submit failed.' };
        }

        return { success: true as const };
      }}
      onUpload={async (formData) => {
        const response = await fetch('/api/admin-feedback/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        const result = (await response.json()) as {
          success: boolean;
          error?: string;
          mediaId?: number;
        };

        if (!result.success || typeof result.mediaId !== 'number') {
          return { success: false as const, error: result.error || 'Upload failed.' };
        }

        return { success: true as const, mediaId: result.mediaId };
      }}
      onDeleteScreenshot={async (mediaId) => {
        const response = await fetch(`/api/admin-feedback/upload/${mediaId}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        const result = (await response.json()) as { success: boolean; error?: string };
        if (!result.success) {
          return { success: false as const, error: result.error || 'Delete failed.' };
        }

        return { success: true as const };
      }}
    />
  );
}
