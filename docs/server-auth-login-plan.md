# SmartDoor Server-Side Login Implementation Plan

## Scope and baseline

- Base branch: `fix/face-analysis-stability`
- Base commit: `3de3ac1058e321bdd01c0b5ae64c23b5f21f4e01`
- Feature branch: `feature/server-auth-login`
- Existing server: `smartdoor_pc.py`, Python `ThreadingHTTPServer`, bound to `127.0.0.1:8765`.
- Existing UI: `index.html`, `dashboard.html`, `styles.css`, `dashboard.js`; retain the current SmartDoor blue/navy visual design and theme support.
- No authentication is implemented yet. Existing Host and Origin checks currently allow only the local origins, which explains why an unconfigured Cloudflare hostname receives 403.

This branch is a planning checkpoint; it does not yet change the running server or enable remote access.

## Required behavior

1. Require server-verified authentication before serving the dashboard or exposing application data/actions.
2. Require a password. If an optional PIN is configured, require it as an additional factor; if no PIN is configured, password alone is used.
3. Support local use and explicitly configured HTTPS Cloudflare access without allowing arbitrary Host headers or trusting arbitrary proxy headers.
4. Protect every API, including state/events, face-event logging, camera stream relay, serial connect/disconnect, and servo commands.
5. Keep face recognition as a testing/logging feature only. A face match must never call `/api/command` or unlock the servo.
6. Preserve the existing Host/Origin protections and tighten them around the configured remote hostname/origin.

## Implementation design

### 1. Server-side authentication in `smartdoor_pc.py`

- Add public login/logout and session-status routes only; all other dashboard/API routes require a valid server-side session.
- Store only a password hash, never a plaintext password in HTML or JavaScript. Prefer a standard-library password KDF such as PBKDF2-HMAC with a random salt and a suitable iteration count. Load the hash and optional PIN verifier from environment variables or a local ignored configuration file; do not commit secrets.
- Generate unpredictable session IDs with `secrets`; keep session state on the server with an idle/absolute expiry. Logout revokes the session. Restarting the server invalidates old sessions.
- Set an HttpOnly, SameSite=Strict cookie. Set Secure for the explicitly configured HTTPS remote hostname; local HTTP loopback may use a non-Secure cookie so local development remains usable. Do not trust `X-Forwarded-Host` or `X-Forwarded-Proto` unless there is a deliberately configured trusted-proxy policy.
- Add a modest login-attempt throttle / temporary lockout, generic failure messages, bounded request bodies, and safe JSON parsing.
- Use constant-time verifier comparisons where applicable. Avoid logging passwords, PINs, session IDs, or authentication payloads.
- Keep logout POST-only and validate the Origin. Apply no-store cache headers to private pages and API responses.

### 2. Host, Origin, and Cloudflare handling

- Retain strict Host validation. Keep `127.0.0.1:8765` and `localhost:8765` for local access.
- Add remote host/origin only through explicit configuration (for example `SMARTDOOR_PUBLIC_HOST` and its exact `https://...` origin). Do not wildcard-allow all `trycloudflare.com` hosts.
- For a Quick Tunnel, the hostname changes when a new tunnel is created, so it must be configured for that run. For repeated use, prefer a stable named Cloudflare Tunnel hostname.
- Continue to bind the Python app to loopback; Cloudflare Tunnel should connect to the local origin. Consider Cloudflare Access as an additional outer identity gate, not a replacement for app authentication.
- Reject unexpected Origin values for state-changing requests; allow requests with no Origin only under a deliberate local-client policy and ensure cookie-authenticated mutations are not cross-site accessible. Add a per-session CSRF token for state-changing actions if needed by the final route design.

### 3. Route protection matrix

| Route / resource | Policy |
|---|---|
| `GET /`, `GET /index.html` | Public login shell only; never expose dashboard controls or private state |
| `POST /api/login` | Public, rate-limited; verifies password and configured PIN |
| `POST /api/logout` | Authenticated; revokes session |
| `GET /api/session` | Public-safe auth status only; no private data |
| `GET /dashboard.html` | Authenticated |
| `GET /styles.css`, `GET /dashboard.js` | May be public static assets, but must reveal no secrets; no API access without session |
| `GET /api/state` | Authenticated |
| `GET /api/camera-stream` | Authenticated; retain existing private-IP/port/path URL validation |
| `POST /api/face-event` | Authenticated |
| `POST /api/connect`, `/api/disconnect` | Authenticated + Origin/CSRF validation |
| `POST /api/command` | Authenticated + Origin/CSRF validation + existing device/command allowlist |
| All unknown routes | 404 without leaking internal details |

Review the final implementation for every route rather than relying only on this table.

### 4. Dashboard login experience

- Add a login view using the existing `styles.css` design tokens, rounded panels, navy/blue gradient, light/dark theme, and responsive layout.
- Password is always required. Show the PIN field only when server configuration says a PIN is enabled; never decide whether a PIN is required solely from a client-side flag.
- On success, navigate to the protected dashboard. On expired/invalid sessions, stop polling and return to login.
- Add a visible logout control and avoid storing credentials or session authority in localStorage/sessionStorage.
- Preserve camera preferences/theme only as non-sensitive UI preferences if desired.

### 5. Face and actuator safety

- Keep face descriptors in the current browser-side prototype behavior unless separately redesigned; do not treat a browser face match as authentication.
- Do not connect any face-match branch to `/api/command`, `LOCK`, or `UNLOCK`.
- Servo commands remain explicit, authenticated manual actions with confirmation. Motion detection remains informational only.
- Keep prototype warnings; do not describe this as a security-grade real-door lock.

## Suggested implementation sequence

1. Add configuration loading and password/PIN verifier setup, with clear startup errors if no password is configured.
2. Add session manager, expiry, cookie handling, login throttling, logout, and session-status endpoints.
3. Centralize Host/Origin checks and add configured remote hostname/origin without weakening local protections.
4. Gate every dashboard/API route and verify camera relay and serial/servo routes are covered.
5. Add the SmartDoor-styled login screen, login/logout client logic, and session-expiry handling.
6. Update README with local setup, secret configuration, optional PIN setup, Cloudflare host/origin configuration, and recovery/reset steps. Ensure secret files are git-ignored.
7. Add automated/manual tests before considering merge.

## Acceptance and security tests

- Unauthenticated requests to dashboard, state, events, camera relay, connect/disconnect, and servo command are rejected.
- Wrong password and wrong PIN fail; password-only mode works only when no PIN verifier is configured.
- Successful login permits the dashboard and APIs; logout immediately revokes the session.
- Expired sessions are rejected; session cookie is HttpOnly and SameSite=Strict, and Secure on configured HTTPS remote access.
- Unknown Host headers and unapproved Origins remain rejected; a random Cloudflare hostname does not become trusted automatically.
- Oversized/malformed JSON and unsupported content types are rejected.
- Camera relay still rejects public IPs, invalid ports, and paths outside the expected ESP32-CAM stream.
- Arduino connect/disconnect and LOCK/UNLOCK commands cannot be invoked without a valid session and valid Origin/CSRF protection.
- Face match, face registration, and PIR motion never trigger an unlock command.
- Existing local dashboard functions, theme, camera streams, event logging, and COM-port selection still work after authentication.
- Test with a servo disconnected/unloaded first. Do not test against a real door lock.

## Out of scope for this first pass

- Automatic face-based authorization or unlocking.
- Treating a short PIN as a replacement for the password.
- Removing Host/Origin checks to make a tunnel work.
- Committing credentials, PINs, password hashes, private face photos, or session secrets.
- Claiming the prototype is suitable for securing a real door.
