# Klimate Mobile

Klimate Mobile is an operations companion for Android and iOS. It exposes live monitor, target, and service health, incidents, and Gateways. Maintenance scheduling remains on the web; collection-state information is shown where it explains health.

## Run locally

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`.
2. Run `pnpm install`.
3. Run `pnpm ios`, `pnpm android`, or `pnpm start`.

Run `pnpm typecheck` and `pnpm test` before shipping a change.

The API URL must be reachable from the simulator or physical device. For a local API, use your computer's LAN address rather than `localhost` on a phone.

The mobile project uses Expo SDK 58 / React Native 0.88. Use Node.js 22.13+, 24.3+, or 26+ (an even-numbered release) and SDK 58-compatible Expo Go. After changing SDK versions, close the previous Expo Go session and restart Metro with `pnpm start --clear`. Standalone development/test builds need rebuilding after a native dependency upgrade; an older installed build cannot use the new native modules through a JavaScript reload alone.

## Inbox recovery

The mobile bell and Unread filter exclude outage messages after the app confirms the monitor is Up or the Gateway is Online through the existing read APIs. All retains these messages with a Recovered label and their original outage text. This does not mark a message as read on the server or change resource/incident status. Explicit reading and Mark all read still use the existing read-state APIs.

Recovery watermarks are stored on this phone, isolated by signed-in user, organization and resource. A later outage remains new; Unknown, paused, missing resources, failed requests and stale responses never imply recovery. Reconciliation runs on Overview/Inbox focus, foreground refresh and pull-to-refresh, including unread messages beyond the first page. It cannot reconcile while the app is suspended or change badge numbers supplied by the push server in the background; foreground refresh corrects the mobile badge. Recoveries that happened and failed again while the phone was offline may remain unconfirmed because Inbox messages do not identify their outage episode.

Normal refreshes always check the newest unread page and reuse verified history for up to two minutes. New arrivals merge into that history only when their IDs and unread-count delta agree. External reads, changed history, expiry and pull-to-refresh force a complete reconciliation. Resource checks are coalesced/cached for 30 seconds (failed checks for five seconds); caches are bounded and isolated by organization/user. Alert details open immediately, while read-state writes and reconciliation finish separately.

## Session and push lifecycle safety

Session refreshes and organization switches are serialized through secure-storage commits. Requests hold identity-bound leases: token refresh within the same organization is allowed, but a request is never replayed across organization changes, sign-out, or a later sign-in. Sign-out invalidates the local session immediately; stale refresh/login responses cannot restore it.

Push registration and device removal share a serial queue. Installation-ID creation is single-flight. Registration rechecks its session after native token/permission awaits, and sign-out removes the device after any in-flight registration. An expired retired access token may be refreshed only for the same user/organization to finish cleanup, never to restore the UI session. Failed removal is retried once and retained as non-secret cleanup metadata (no access or refresh tokens). It is retried with matching credentials before that owner next registers; another owner's token is never used to delete it. A successful registration supersedes obsolete cleanup for that same installation because the API rebinds its ownership.

The sign-in screen warns when removal cannot be confirmed. Offline sign-out cannot guarantee immediate cessation of server-sent notifications without server-side cooperation; local sign-out must not claim otherwise. Already-delivered notifications are dismissed locally. Remote push lifecycle tests require standalone/development builds, not Expo Go.

## Android internal testing

Build an installable standalone APK with `eas build --platform android --profile preview`. This uses the hosted HTTPS API and does not require Expo Go or Metro. It is not a Google Play submission. Production store-readiness checks remain separate.

Open the resulting EAS build link on a physical Android phone and install its APK. If prompted, temporarily allow installation from that browser and turn the permission off again afterward. Sign in, open Overview's avatar → Alerts, allow notifications, and use **Check push registration**. Confirm the app reports that the phone is registered for downtime alerts.

Use only a dedicated test monitor/gateway in an isolated test organization to exercise an outage, through existing web controls. Do not interrupt production devices. Check delivery with the app foregrounded, backgrounded, and the screen locked; do not Android-force-stop the app. Tap a notification to verify navigation. Foreground sound/vibration tests alone do not prove remote push delivery. Capture registration errors or missing delivery results before making backend changes.

## Release setup

Versions and iOS build numbers use `year.month.counter`, starting at `2026.10.1`. Android encodes the same components as `YYYYMMNN` (`20261001`). Before preparing each new distributed build, run `pnpm version:next`: it advances the shared counter in the same month, resets to `1` in a new UTC month, and updates both app/package versions and native build fields. Counters are limited to 1–99. Released builds retain their test-build version, so public versions may skip counters. A paired Android/iOS build shares one counter. Do not bump again merely to promote an existing artifact.

EAS uses local app versions with independent auto-increment disabled. Dynamic config derives both native build fields from `expo.version`, preventing drift. Version changes happen explicitly before a build, never during config evaluation; this avoids inconsistent versions across local/cloud steps. The complete Android number always increases across months even though the monthly counter resets. Never reuse a counter for a replacement build uploaded to a store.

- The iOS bundle ID and Android application ID are `app.klimate.mobile`.
- The app is linked to `@fonbeat/klimate` (organization display name Fonbeat Ltd), EAS project ID `cb5632fc-61d6-4928-b97c-1922e64cefe1`. This replaces the accidentally deleted project. The owner and project ID are saved in `app.json`; `EAS_PROJECT_ID` is an optional override, not required for this linked project.
- Configure APNs and FCM v1 credentials in the Expo/EAS project. Do not put APNs private keys or Firebase service-account keys in the repository or chat.
- Firebase Android client configuration is wired through `./google-services.json` for `app.klimate.mobile`. The file stays ignored by Git but is included in EAS uploads by `.easignore`. `GOOGLE_SERVICES_JSON` can override this path using an EAS file environment variable. Never use a service-account private key here.
- Set `KLIMATE_APP_ICON` to an approved 1024 × 1024 PNG without an alpha channel and `KLIMATE_ADAPTIVE_ICON` to a padded 1024 × 1024 Android adaptive foreground PNG. Paths are relative to the mobile project unless absolute file-variable paths are used.
- Run `pnpm check:store` (Node 22+). It loads local `.env` when present and reports missing setup. `EAS_BUILD_PLATFORM=ios` skips Android-only checks. This does not validate remote credentials or certify compliance.
- Build with `eas build --platform all --profile production` and submit with `eas submit --platform all --profile production`.

`app.config.js` preserves Expo Go/development networking but hardens preview/production builds: HTTPS-only production API, no arbitrary-load/localhost ATS exceptions, Android cleartext disabled, target/compile SDK 36, no storage/media/microphone permissions, no release overlay permission, and no unused iOS Face ID/microphone purpose strings. Production configuration fails early when project, Firebase, or approved icon setup is missing. These native changes require a new app build; Expo Go only previews JavaScript/UI changes.

EAS project/icon paths must be available during local config resolution (plain-text/non-secret build settings). Firebase secret-file validation is deferred to the EAS post-install check, when file variables exist on the builder. A local `check:store` requires a local Firebase client file; do not export server service-account keys to satisfy it.

### Store submission checks requiring owner input

- Privacy policy: `https://www.klimate.app/privacy`; support: `help@klimate.app`. Both are linked from sign-in and Profile. The confirmed legal owner and store seller identity is Fonbeat Ltd, matching the public policy.
- Complete Apple App Privacy and Google Data safety declarations using actual production data handling. Audit account name/email/user IDs, installation IDs and push tokens, enterprise monitoring data, support correspondence, IP/security logs, and Expo/APNs/FCM service processing. Confirm retention/deletion practices with the owner; do not mark all data as uncollected merely because this is a read-only client.
- Inspect the signed iOS archive's aggregated SDK privacy manifest/report. Do not add fabricated reasons or an empty manifest as a substitute for this check.
- Confirm Xcode 26+/iOS 26 SDK and Android API 36+ in the build output; verify 16 KB native-library compatibility in the Android release artifact.
- Provide reviewers a dedicated populated demonstration organization with reliable sign-in and MFA access instructions; do not use the owner's account or expose real customer infrastructure. Current mobile login does not support SSO-only accounts or initial MFA enrollment. There is no mobile signup flow; revisit account-deletion requirements before introducing signup, external signup links, or automatic account provisioning.
- Test physical-device push delivery, denial/revocation of notification permission, disabled Android channels, background/closed app behavior, logout and organization switching, offline/error states, VoiceOver/TalkBack, large text, and iPad layouts.
- Supply branded store screenshots, support/privacy URLs, content/age ratings, and the accurate enterprise companion description. There are no mobile purchases or upgrade links; reassess billing policy before introducing them.

## Product boundary

The mobile client intentionally performs no enterprise configuration. Its writes are limited to authentication/session operations, organization switching, push-device registration, notification preferences, and inbox read state. Operational resources remain read-only.

The Status tab switches between monitor, target, and service cards in the backend's order. Services are offered when the organization's module is enabled. Overview stays monitor-based and surfaces down/attention monitors. Gateways has its own tab.

Monitor cards and target reports route to protocol-specific PATH, SNMP device/interface, FLOW, SYSLOG, and SERVER reports. Service details include observed availability coverage, component collection states, and paginated incident history. Incidents distinguish monitors, services, and Gateways. Inbox contains durable messages; its badge counts unread messages only.

## Foreground alert sounds and vibration

Profile & Preferences → Alerts combines phone notification permission status with a While using the app section. Permission is checked when opening Alerts and returning from phone settings, including quiet/provisional iOS permission and blocked Android incident channels. The UI provides permission-request and phone-settings actions and distinguishes missing push-build configuration from permission. Monitor-down and gateway-offline push types have no mobile opt-out; startup/foreground registration reads the existing push preferences API and only PATCHes when either needs enabling. Server enforcement across other clients is unchanged.

Foreground controls include independent Monitor-down and Gateway-offline sound switches, a selectable Test sound preview, a Vibrate on alerts switch, and a Test vibration button. All switches default to enabled and are saved locally per user on this device; they never disable push alerts. Existing saved sound choices are preserved when vibration is added. When enabled, one brief non-repeating vibration accompanies each new outage cue, independently of sound toggles and silent mode (subject to OS vibration settings). Test vibration works even when the vibration toggle is off. Backgrounding, logout, organization changes, and preference changes cancel outstanding vibration.

One app-wide listener polls `GET /v2/status/sound` every 30 seconds while authenticated and foregrounded. The first response establishes the server cursor silently; subsequent polls return it as `since`. Only `monitorDown` and `probeDown` trigger enabled sound/vibration feedback. The backend groups simultaneous outages into a single highest-priority cue; vibration follows that same grouping. Muted cues and recoveries advance the cursor silently. Backgrounding, logout, and organization changes invalidate pending responses and stop playback; foreground return starts a fresh cursor without replaying old events. API failures remain silent and retry on the next interval.

Foreground outage push sounds are suppressed to avoid doubling the API chime; notification list entries and unread state remain separate. Background push behavior is unchanged. iOS playback does not override silent mode; Android follows media-volume/audio routing settings. No microphone or background-audio permission is requested. Foreground audio is available in Expo Go; push notifications still require appropriate native-build configuration/testing.

Original WAV assets are generated by `node scripts/generate-alert-sounds.cjs`.

Focused screens refresh every 30 seconds and when returning from the background. Automatic list refresh preserves the loaded range. Identical GETs share in-flight requests; reads respect Retry-After with one bounded retry. Mutation requests are not automatically retried. API reads and navigation remain organization-scoped.

Password sign-in accepts direct sessions and existing authenticator MFA. First-time MFA enrollment and SSO still require the web app: the current SSO callback returns to the web dashboard, not a mobile deep link.

## Mobile V2 UI foundation

- `src/tokens.ts` is the source of truth for light/dark colors, spacing, typography, radii, control heights, and responsive layout values.
- `src/components.tsx` contains accessible reusable cards, buttons, search, filters, status indicators, summary strips, and loading/error/empty states.
- Monitor, incident, and probe feeds use server pagination and virtualized lists. Tablet layouts switch to two columns at the shared breakpoint.
- Status meaning is domain-aware in `src/status.ts`; do not infer maintenance, incident, and monitor colors from one shared list of labels.
