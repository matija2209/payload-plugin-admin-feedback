import type { PayloadRequest } from 'payload';

export type FrontendDisplayConfig = {
  enabled?: boolean;
  include?: string[];
};

export type ScreenshotConfig = {
  enabled?: boolean;
  maxFileSizeBytes?: number;
  allowedMimeTypes?: string[];
};

export type AdminFeedbackPluginOptions = {
  enabled?: boolean;
  emailTo: string | string[];
  fromLabel?: string;
  allowScreenshotUpload?: boolean;
  maxMessageLength?: number;
  mediaCollectionSlug?: string;
  strictMediaCollection?: boolean;
  screenshot?: ScreenshotConfig;
  headerImageUrl?: string;
  frontend?: FrontendDisplayConfig;
  frontendRouteMatcher?: (pathname: string) => boolean;
};

export type ResolvedAdminFeedbackPluginOptions = Omit<
  AdminFeedbackPluginOptions,
  'frontend' | 'screenshot' | 'mediaCollectionSlug' | 'strictMediaCollection'
> & {
  frontend: Required<FrontendDisplayConfig>;
  screenshot: Required<ScreenshotConfig>;
  headerImageUrl?: string;
  mediaCollectionSlug: string;
  strictMediaCollection: boolean;
};

export type FeedbackMetaInput = {
  userAgent?: string;
  locale?: string;
  viewport?: string;
  createdAt?: string;
};

export type CreateFeedbackInput = {
  message: string;
  pagePath: string;
  selector?: string;
  selectedText?: string;
  screenshotId?: number | null;
  meta?: FeedbackMetaInput;
};

export type FeedbackEmailData = {
  message: string;
  pagePath: string;
  selector?: string | null;
  selectedText?: string | null;
  screenshotUrl?: string | null;
  createdByEmail?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
};

export type AdminFeedbackHookArgs = {
  req: PayloadRequest;
  doc: Record<string, unknown>;
  operation: 'create' | 'update';
};
