## Summary
Login feels frozen because the frontend probes multiple API base URLs with an 800ms timeout and awaits this resolution during login. The first request blocks on base detection, adding noticeable delay.

## Fix Strategy
1. Make API base resolution fast-path and non-blocking.
2. Remove redundant probes and long timeouts.
3. Avoid duplicate resolution in both the interceptor and the login submit.

## Changes
- web/src/api.js
  - Initialize `cachedBase` immediately from env or `http://127.0.0.1:4000`.
  - Reduce probe candidates to `http://127.0.0.1:4000` and `http://localhost:4000` only.
  - Cut probe timeout from 800ms to 250ms.
  - Return `getApiBaseSync()` in the axios interceptor (no `await`).
  - Keep a background probe that updates `cachedBase` if needed, but never blocks requests.
- web/src/pages/Login.jsx
  - Use a relative path `'/api/auth/login'` and remove the explicit `resolveApiBase()` call to avoid double resolution.

## Verification
- Restart frontend dev server.
- Click Login (email `admin@example.com`, password `admin123`, role `Super Admin`).
- Observe the button transitions immediately and the request completes quickly (no visible freeze).
- Confirm token stored and navigation to `/dashboard`.

## References
- Current probe and timeout: `web/src/api.js:18–21`, `web/src/api.js:33–35`.
- Login submit currently awaits resolution: `web/src/pages/Login.jsx:18–20`. 