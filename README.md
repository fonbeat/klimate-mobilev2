# Klimate Mobile

Klimate Mobile is an operations companion for Android and iOS. It exposes live monitor health, incidents, attention items, maintenance windows, and probes.

## Run locally

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`.
2. Run `pnpm install`.
3. Run `pnpm ios`, `pnpm android`, or `pnpm start`.

The API URL must be reachable from the simulator or physical device. For a local API, use your computer's LAN address rather than `localhost` on a phone.

## Release setup

- The iOS bundle ID and Android application ID are `app.klimate.mobile`.
- Add an EAS project ID before enabling production Expo push registration.
- Configure APNs and FCM credentials in the Expo/EAS project.
- Build with `eas build --platform all --profile production` and submit with `eas submit --platform all --profile production`.

## Product boundary

The mobile client intentionally performs no enterprise configuration. Its only non-read API operations are authentication, token refresh/logout, and push-device registration.
