# payload-plugin-admin-feedback

Floating feedback/chat widget plugin for Payload CMS admin and selected Next.js frontend routes.

## Features

- Adds `admin-feedback` collection to Payload
- Floating client widget with:
  - message input
  - current page path capture
  - optional CSS selector capture
  - optional screenshot upload (via media collection)
- Email notification on feedback creation through configured Payload email adapter
- Frontend allowlist route matching helper

## Install

```bash
pnpm add payload-plugin-admin-feedback
```

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
- `maxMessageLength?: number` default `3000`
- `frontend?: { enabled?: boolean; include?: string[] }`
- `frontendRouteMatcher?: (pathname: string) => boolean`

## License

MIT
