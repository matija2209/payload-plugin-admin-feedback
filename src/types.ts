import type { PayloadRequest, Config } from 'payload';

export type FrontendDisplayConfig = {
  enabled?: boolean;
  include?: string[];
};

export type ScreenshotConfig = {
  enabled?: boolean;
  maxFileSizeBytes?: number;
  allowedMimeTypes?: string[];
  capturePolicy?: 'current-tab-first' | 'strict-current-tab' | 'any-surface';
};

export type AdminFeedbackPluginOptions = {
  enabled?: boolean;
  emailTo: string | string[];
  fromLabel?: string;
  fromName?: string;
  fromAddress?: string;
  email?: Config['email'];
  allowScreenshotUpload?: boolean;
  maxMessageLength?: number;
  mediaCollectionSlug?: string;
  strictMediaCollection?: boolean;
  screenshot?: ScreenshotConfig;
  frontend?: FrontendDisplayConfig;
  frontendRouteMatcher?: (pathname: string) => boolean;
};

export type ResolvedAdminFeedbackPluginOptions = Omit<
  AdminFeedbackPluginOptions,
  'frontend' | 'screenshot' | 'mediaCollectionSlug' | 'strictMediaCollection'
> & {
  frontend: Required<FrontendDisplayConfig>;
  screenshot: Required<ScreenshotConfig>;
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
  id?: string | number;
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
