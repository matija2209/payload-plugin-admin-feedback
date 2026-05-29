# Changelog

## 1.0.4

### Added

- **Multi-tenant screenshot uploads** — optional `tenant` config on `adminFeedbackPlugin()` (`collectionSlug`, `fieldName`, `formDataSlugKey`, `pathMarkers`, `resolveTenantId`)
- `FrontendFeedbackWidget` props: `tenantPathMarkers`, `tenantFormDataKey`
- Exported `extractTenantSlugFromPathname` for path-based tenant slug detection
- Screenshot capture policies (`current-tab-first`, `strict-current-tab`, `any-surface`) and plugin screenshot limits / MIME allowlist

### Changed

- **Feedback widget UI** — tab-first screenshot capture, full-screen annotation (pen, rectangle, arrow, text, undo/redo), clipboard paste, and file upload; improved widget state management and icons
- Plugin configuration options (`screenshot`, `frontend`, `strictMediaCollection`, `mediaCollectionSlug`)
- Email notifications — improved HTML template and metadata
- Internal structure split into focused modules (endpoints, hooks, client, tenant helpers)
- Build uses tsup with explicit client boundary stamping for Next.js App Router

### Fixed

- Page path tracking on feedback submit
- Admin feedback collection request typing

### Upgrade notes (from 1.0.3)

- Use scoped package name: `@matija2209/payload-plugin-admin-feedback`
- Remove custom Next.js routes under `src/app/api/admin-feedback/` — the plugin registers Payload collection endpoints (`/submit`, `/upload`, …)
- Multi-tenant is opt-in: set `tenant.enabled: true` and pass `tenantPathMarkers` on `FrontendFeedbackWidget` when media must be tenant-scoped
