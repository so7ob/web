# Server authentication — additional phase C portion (#4)

Depends on the durable worker PR #11 and its CI corrections; no PR has been merged. The API now owns opaque server sessions, token consumption and account operations. NextAuth is not used by this implementation. The private UI and remaining business/authorization routes are still unfinished.

## Preserved account and route contracts

Both `/api/auth/*` and `/api/v1/auth/*` expose register, verify-email, forgot-password, reset-password, change-password, invite, sessions, providers, csrf, session, callback/credentials and signout. Credentials/signout preserve the `{url}` response used by the old client; verify-email retains 307 redirects and language/result parameters. Explicit HTTP status handling avoids Nest's default 201 changing a successful login from 200.

DTOs use class-transformer/class-validator; name/email normalization, truncation, password constraints and field error codes follow the source. Registration always selects `client` and pending verification, independent of posted role fields. Unknown posted fields are ignored as in the source; they cannot become persistence properties. Bcrypt remains at cost 12 and imported hashes are verified directly. Invitations take the role from the stored invite. Duplicate registration/invite conflicts retain their 409 response.

Legacy token hashes, types, resource binding, expiries and consumed state work without conversion or extension. Consumption uses a conditional update and checks suspended users inside the transaction; concurrent consumers cannot both succeed. Request-claim token helpers remain bound to both the user and request, but the actual claim business routes are not migrated yet.

Registration, token issue, encrypted mail enqueue and audit now commit in one transaction. Reset/change password revoke sessions atomically. Production returns `emailStatus: queued`, never `sent` before SMTP acceptance. The existing explicit non-production EMAIL_DEV_MODE preserves `dev_logged` and development links; production ignores that flag and never exposes raw token URLs. Outbox UI labels and complete delivery journeys await the UI/business port.

## Session transition and CSRF

A fresh random 32-byte cookie is fingerprinted using a new namespace in AuthSession. Legacy JWT cookies are ignored; imported session rows remain historical. The client-portal portion adds an explicit `opaque-v1:` stored fingerprint tag so historical or cutoff-invalid sessions are excluded from active-device listings without modifying the imported records. The approved one-time re-login preserves account IDs and passwords. The lifetime is 30 days without silently extending old token/session expiry. Each request checks expiry, revocation, current account status, global cutoff and current role permissions. Password changes and session-revoke operations recheck the session inside their database transaction.

Production cookies use `__Host-` names, Secure, HttpOnly, SameSite=Lax and Path=/ with no Domain attribute. AUTH_SECRET signs one-hour CSRF challenges and has no known development fallback. Rotating AUTH_SECRET invalidates CSRF challenges, not opaque sessions; session invalidation is controlled explicitly through database revocation/cutoffs.

Mutations require the configured trusted Origin, or a valid signed CSRF challenge for a non-browser request without Origin. Cross-site Fetch Metadata is rejected. Credentials and signout always require the CSRF challenge. Cookie-only curl mutations that relied on absent Origin must now obtain a challenge and send `X-CSRF-Token`; this is a documented security tightening. Callback URLs are confined to SITE_URL's origin. Express's configured proxy trust supplies client IP, rather than trusting arbitrary user-sent forwarded headers.

Account lockout remains five failed attempts and a 15-minute lock/window, now serialized on the account row. Registration and recovery retain three attempts/10 minutes and ten/day in MariaDB. A new shared login network limit (30/10 minutes, 200/day) bounds abusive unknown-account traffic and is a documented security addition. No raw IP is stored in those buckets.

The source's “revoke all other sessions” route also sets a global cutoff, invalidating the current login. This implementation preserves that actual behavior and count semantics; it does not silently reinterpret the source comment/UI. A future product correction needs a separate approved behavior change.

## Evidence and limitations

Real MariaDB integration checks cover concurrent account lockout, shared rate limits, one-use verification/reset/invites, wrong/expired/suspended/bound tokens, bcrypt, legacy-cookie rejection, transactional enqueue failure, record-level session ownership, password change and audit rollback. A compiled Nest process is exercised over HTTP using both route families, secure cookie attributes, DTO errors, CSRF/Origin rejection, fixed registration role, encrypted verification mail, one-use redirects, suspension and logout. No mocked database is used.

The API logger/filter emits no SQL bindings, password hashes, tokenized URLs or provider payloads on failures. Swagger documents the DTOs. This is not full Website parity: admin authorization/last-active-admin operation checks, request/inquiry ownership, private attachment access, all UI account journeys, CMS and the editor remain acceptance work. The AuthorizationLock schema prepares serialization of last-admin changes but is not itself evidence that those operations are implemented.

Original pure validation, all 27 block schemas, permission rules and status-transition tests now run from the shared contracts package without changing their expectations (44 additional source tests). Browser and server can use the same rules without exposing persistence types. Password/name length checks retain the source UTF-16 length semantics, including emoji. Framework-provided NextAuth interstitial pages, complete auth browser screens and full account journey comparison are not yet accepted.

## Follow-up admission correction

The request/account-services portion now counts registration/recovery attempts before parsing and DTO validation, matching the source even for malformed JSON. Single-use permits avoid counting a valid request twice. Compiled HTTP checks cover invalid/malformed attempts and shared alias limits. Registration password errors retain source precedence (short, long, weak). See [business services](business-services.md).
