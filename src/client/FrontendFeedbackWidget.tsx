'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

import { extractTenantSlugFromPathname } from '../tenant/extractTenantSlug';
import { FeedbackWidget } from './FeedbackWidget';
import { pathMatchesAllowlist } from './routeMatcher';

type FrontendFeedbackWidgetProps = {
  include: string[];
  locales?: string[];
  title?: string;
  submitLabel?: string;
  uploadLabel?: string;
  /** URL markers (`pisarna`, `narocilnica`, …) — tenant slug is the segment before the marker. */
  tenantPathMarkers?: string[];
  /** FormData key for tenant slug on upload (default `tenant`). */
  tenantFormDataKey?: string;
};

const normalizePathname = (pathname: string, locales: string[]): string => {
  if (locales.length === 0) {
    return pathname;
  }

  const segments = pathname.split('/').filter(Boolean);
  const maybeLocale = segments[0];
  if (maybeLocale && locales.includes(maybeLocale)) {
    return `/${segments.slice(1).join('/')}`;
  }

  return pathname;
};

export function FrontendFeedbackWidget({
  include,
  locales = [],
  title = 'Feedback',
  submitLabel = 'Send',
  uploadLabel = 'Upload image',
  tenantPathMarkers = [],
  tenantFormDataKey = 'tenant',
}: FrontendFeedbackWidgetProps) {
  const pathname = usePathname();
  const normalizedPathname = normalizePathname(pathname, locales);

  if (!pathMatchesAllowlist(normalizedPathname, include)) {
    return null;
  }

  return (
    <FeedbackWidget
      title={title}
      submitLabel={submitLabel}
      uploadLabel={uploadLabel}
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
        if (tenantPathMarkers.length > 0) {
          const tenantSlug = extractTenantSlugFromPathname(pathname, tenantPathMarkers);
          if (tenantSlug) {
            formData.set(tenantFormDataKey, tenantSlug);
          }
        }

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
