# Shared delivery UI

Figma reference: Tech-Triathon, dispatcher header `206:860`, home `206:607`,
allocation `217:1116`, reassignment dialog `246:2542`, deferrals `275:5318`.
The original logo (`206:862`) and account icon (`206:900`) are downloaded into
`public/assets`; do not replace them with a recreated logo. Plus Jakarta Sans
is bundled locally through Fontsource. No runtime Figma URLs are used.

## Preview

From the repository root: `pnpm dev:web`, then open
http://localhost:3000/components.html. This separate development preview works without the app authentication or sync providers.
The application also uses the same header and footer through `ShellHeader` and `AppFooter`.
It is a common-component showcase, not a finished operational dashboard. All records and metric values in this preview are examples.
Header sync starts as `idle` because no backend connection is established.
The navigation examples for loader, driver and store manager configure menus only;
they do not implement those roles' pages.

## Integration

Import from `components/common`. Include `common.css` and the Fontsource import
once at the application entry point. Pass application data and callbacks as props.
The layout does not depend on authentication, the sync service or backend endpoints.

```tsx
<AppLayout
  role="dispatcher"
  activeId="orders"
  locale={locale}
  onLocaleChange={setLocale}
  syncStatus="idle"
  account={{ name: 'Dispatch Desk', roleLabel: 'Dispatcher' }}
  depotLabel="Peliyagoda · DC-01"
>
  <OrderQueue />
</AppLayout>
```

`roleNavigation` supplies default menus for `dispatcher`, `loader`, `driver`, and
`store_manager`. Override `navigationItems` to supply the actual routes needed by
a role. Default hash URLs are frontend navigation only, never authorization.

- Layout: `AppLayout`, `AppHeader`, `AppFooter`, `BrandLogo`, `RoleNavigation`.
- Header controls: `LanguageSelector`, `SyncIndicator` (idle, connected, syncing, offline).
- Content: `PageHeading`, `Card`, `MetricCard`, `CapacityBar`, `EmptyState`.
- Feedback: `Badge`, `AlertBanner`, `Modal`.
- Controls: `Button`, `TextField`, `SelectField`, `SegmentedControl`, `Pagination`.
- Tables: use semantic table markup with `wp-table` inside `wp-table-scroll`;
  the preview demonstrates search, filtering, empty state and pagination.

Navigation and sync labels support the existing three locales. Other components
accept caller-provided translated content. Preview copy is English.

The header becomes a two-row layout on tablets and an expandable menu on phones.
Interactive controls have at least 44px touch targets; tables scroll inside their
own region. Native modal dialogs support Escape, focus containment, return focus,
backdrop dismissal, and body scroll locking. Animations honor reduced motion.

## Verification and existing integration limitations

- `pnpm --filter web check:components`: type-checks the common components and
  their separate preview using `tsconfig.components.json`.
- `pnpm --filter web build`: the original application build, unchanged. It still
  reports the pre-existing `SyncContext` contract errors; this work does not hide
  or fix them.

The normal application retains its role shells and providers. `ShellHeader` is only
a context adapter for `AppHeader`, not a second header design. It retains the
language switching with Figma-style segmented buttons, Colombo clock, online status and pending-sync
action, and removes the role-switching buttons. No workflow navigation is supplied
by this adapter until the dispatcher pages are implemented. The preview demonstrates
the configurable navigation. Authentication still uses the existing mock users.
`AppFooter` is shared between the app and preview, with optional depot details.
Other role files, sync code and backend code remain unchanged. No browser-test framework is added.

The shared footer is a compact internal-app footer with copyright and optional depot
details. It has no marketing links or public information page.
