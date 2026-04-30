![Payload Admin Feedback Plugin header](./public/payload-admin-plugin-header.png)

# payload-plugin-admin-feedback

Floating feedback/chat widget plugin for Payload CMS admin and selected Next.js frontend routes.

## Features

- Adds `admin-feedback` collection to Payload
- Floating client widget with:
  - message input
  - current page path capture
  - optional CSS selector capture
  - screenshot capture, annotation, clipboard paste, and file upload
- Email notification on feedback creation through configured Payload email adapter
- Frontend allowlist route matching helper
- Strict media collection validation with fail-fast startup errors

## Install

```bash
pnpm add payload-plugin-admin-feedback
```

## Requirements

- `payload` `^3.84.1` (native advanced plugin API with `definePlugin`)
- `react` ^19

## Version Compatibility

| Plugin Version | Payload Version |
| -------------- | --------------- |
| 1.x.x          | ^3.84.1         |

## Usage

```ts
import { buildConfig } from 'payload'
import { adminFeedbackPlugin } from 'payload-plugin-admin-feedback'

export default buildConfig({
  // ...
  plugins: [
    adminFeedbackPlugin({
      emailTo: 'it@example.com',
      fromLabel: 'Store Admin Feedback',
      allowScreenshotUpload: true,
      mediaCollectionSlug: 'media',
      strictMediaCollection: true,
      screenshot: {
        maxFileSizeBytes: 5 * 1024 * 1024,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      },
      maxMessageLength: 3000,
      frontend: {
        enabled: true,
        include: ['/marketplace*', '/profile*'],
      },
    }),
  ],
})
```

## Plugin Options

- `enabled?: boolean` default `true`
- `emailTo: string | string[]` required
- `fromLabel?: string`
- `allowScreenshotUpload?: boolean` default `true`
- `mediaCollectionSlug?: string` default `'media'`
- `strictMediaCollection?: boolean` default `true`
- `screenshot?: { enabled?: boolean; maxFileSizeBytes?: number; allowedMimeTypes?: string[]; capturePolicy?: 'current-tab-first' | 'strict-current-tab' | 'any-surface' }`
- `maxMessageLength?: number` default `3000`
- `frontend?: { enabled?: boolean; include?: string[] }`
- `frontendRouteMatcher?: (pathname: string) => boolean`

## Storage Adapter Compatibility

The plugin uploads images through the resolved Payload upload collection, not directly to a specific storage adapter.

- If your upload collection is configured with `@payloadcms/storage-*`, uploads are automatically stored there.
- If the configured collection slug is missing or not upload-enabled, plugin initialization fails with a clear error.
- In strict mode (default), there are no fallback guesses to other collections.

## Migration Notes

- The plugin uses native Payload advanced plugin metadata (`slug`, `order`, `options`) via `definePlugin`.
- Existing usage with `adminFeedbackPlugin({ ...options })` remains unchanged.

## License

MIT
