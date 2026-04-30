![Payload Admin Feedback Plugin header](./public/payload-admin-plugin-header.png)

# payload-plugin-admin-feedback

Floating feedback/chat widget plugin for Payload CMS admin and selected Next.js frontend routes.

## Features

- Adds `admin-feedback` collection to Payload
- Floating client widget with:
  - message input
  - current page path capture
  - optional CSS selector capture
  - current-tab-first screenshot capture, full-screen annotation, clipboard paste, and file upload
  - native HTML5 tools for pen, rectangle, arrow, text, undo, redo, clear, and revert
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

## Setup

### 1. Register the plugin in your Payload config

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
        capturePolicy: 'current-tab-first',
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

This registers the `admin-feedback` collection with custom endpoints (`/submit`, `/upload`, `/upload/:id`) — no additional API routes are needed.

### 2. Add the admin panel widget

In your Payload admin layout (`src/app/(payload)/layout.tsx`):

```tsx
import { AdminFeedbackWidget } from 'payload-plugin-admin-feedback/client'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
      <AdminFeedbackWidget />
    </RootLayout>
  )
}
```

The admin widget automatically sends authenticated requests (HTTP-only cookies via `credentials: 'include'`).

### 3. Add the frontend widget

In your Next.js frontend locale layout (`src/app/(frontend)/[locale]/layout.tsx`):

```tsx
import { FrontendFeedbackWidget } from 'payload-plugin-admin-feedback/client'

export default async function LocaleLayout({ children, params }) {
  return (
    <html>
      <body>
        {/* ... */}
        <FrontendFeedbackWidget
          include={['/marketplace*', '/profile*', '/checkout*']}
          locales={['en', 'ru', 'sl']}
        />
        {children}
        {/* ... */}
      </body>
    </html>
  )
}
```

**`FrontendFeedbackWidget` props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `include` | `string[]` | required | Glob-style route patterns to show the widget on. Supports `*` wildcard suffixes (e.g. `'/profil*'` matches `/profile`, `/profile/orders/123`). |
| `locales` | `string[]` | `[]` | Supported locale prefixes. The widget strips the locale segment before matching against `include` patterns. If all your routes are non-prefixed, leave empty. |
| `title` | `string` | `'Feedback'` | Widget title. |
| `submitLabel` | `string` | `'Send'` | Submit button label. |
| `uploadLabel` | `string` | `'Upload image'` | Upload button label. |

**How locale normalization works:** When `locales` is `['en', 'ru', 'sl']`, the widget strips the first path segment if it matches a locale. For example, `/en/marketplace` becomes `/marketplace` before checking the `include` patterns. This means you write patterns once and they work across all locales.

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

## Screenshot Capture Behavior

- `current-tab-first` is the default. The widget prefers the active browser tab and still accepts window or screen capture if the browser returns a broader surface.
- `strict-current-tab` requires the captured surface to resolve as a browser tab and fails otherwise.
- `any-surface` allows the browser to offer any supported surface without tab-first constraints.
- Captured, pasted, and uploaded images all open in the same full-screen HTML5 annotation editor and are exported as a flattened PNG before upload.

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
