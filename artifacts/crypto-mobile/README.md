# CryptoGuard Mobile

Expo React Native companion app for CryptoGuard — monitor cryptographic risk, findings, and environment health on the go.

## Screens

- **Dashboard** — Overall risk score, finding breakdown, expiring certificates summary
- **Findings** — Filterable list with severity/status filters; acknowledge, resolve, or reopen findings
- **Environments** — Risk score and last scan time per environment

## Development

### Start Metro (recommended)

The `CryptoGuard Mobile` workflow starts Metro on port 22995 and serves the app at `/crypto-mobile/` on the Replit dev domain.

```bash
cd artifacts/crypto-mobile
EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN node scripts/start.js
```

Or via pnpm from the workspace root:

```bash
pnpm --filter @workspace/crypto-mobile run dev
```

### Scan QR code

Metro prints a QR code in the console. Scan it with the **Expo Go** app on iOS or Android to test on a real device.

### Web preview

The web bundle is served at `https://$REPLIT_DEV_DOMAIN/crypto-mobile/` and renders the app in a browser via Expo Web.

## Workflow notes

The artifact-managed `artifacts/crypto-mobile: expo` workflow has a known platform-level health-check deadlock (`kind="mobile"` health checks route through the Expo dev domain before the workflow is RUNNING). The `CryptoGuard Mobile` configureWorkflow-based workflow bypasses this by omitting `waitForPort`. This is tracked for resolution in follow-up task #13.

Once the platform-side issue is resolved, `scripts/start.js`, `scripts/build.js`, and `server/serve.js` can be removed in favour of the standard Expo CLI commands.

## Push notifications

`hooks/useNotifications.ts` is a typed no-op scaffold. To enable real push notifications:

```bash
pnpm --filter @workspace/crypto-mobile add expo-notifications
```

Then replace the stubs in `hooks/useNotifications.ts` with real `expo-notifications` API calls.

## API connectivity

The app connects to the shared API server (`@workspace/api-server`) using `@workspace/api-client-react` hooks. The base URL is set from `EXPO_PUBLIC_DOMAIN` at startup in `app/_layout.tsx`.
