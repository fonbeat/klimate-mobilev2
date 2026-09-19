# Klimate Mobile

Klimate Mobile is an operations companion for Android and iOS. It exposes live monitor health, incidents, attention items, maintenance windows, and probes.

## Run locally

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`.
2. Run `pnpm install`.
3. Run `pnpm ios`, `pnpm android`, or `pnpm start`.

Run `pnpm typecheck` and `pnpm test` before shipping a change.

The API URL must be reachable from the simulator or physical device. For a local API, use your computer's LAN address rather than `localhost` on a phone.

## Release setup

- The iOS bundle ID and Android application ID are `app.klimate.mobile`.
- Add an EAS project ID before enabling production Expo push registration.
- Configure APNs and FCM credentials in the Expo/EAS project.
- Build with `eas build --platform all --profile production` and submit with `eas submit --platform all --profile production`.

## Product boundary

The mobile client intentionally performs no enterprise configuration. Its only non-read API operations are authentication, token refresh/logout, and push-device registration.

## Mobile V2 UI foundation

- `src/tokens.ts` is the source of truth for light/dark colors, spacing, typography, radii, control heights, and responsive layout values.
- `src/components.tsx` contains accessible reusable cards, buttons, search, filters, status indicators, summary strips, and loading/error/empty states.
- Monitor, incident, and probe feeds use server pagination and virtualized lists. Tablet layouts switch to two columns at the shared breakpoint.
- Status meaning is domain-aware in `src/status.ts`; do not infer maintenance, incident, and monitor colors from one shared list of labels.
