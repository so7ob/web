# Safe outbox state presentation — #43

Confirmed at develop `85ab40b8c7558f0590c684c4eb1031fbae678a66`: queued/retry/uncertain
were rendered as development logging. The regression test failed before the fix
because attempts/error-code metadata was absent; the existing queue tests exercise
real SMTP ambiguity and lease fencing.

The shared DTO exposes explicit states, attempt count, next queued/retry timestamp
and an allowlisted error code. Current MailJob status takes precedence over its
possibly lagging EmailLog. Logs without jobs retain recognized historical states;
other states become `unknown`. Missing historical operational metadata stays null.
Error strings, provider responses/IDs, payloads, digests and lease tokens never enter
the DTO. Existing bodyText/bodyHtml/error remain empty/null/null. Access still
requires `email.outbox`; neither queue writes nor resend controls were added.

Arabic/English labels distinguish every state and explain that sent means SMTP
acceptance, not inbox delivery. Browser tests cover both locales and 375/1280,
keyboard and axe; MariaDB regression covers every job state, history, redaction
and denied access. Queue concurrency/ambiguous-send tests remain unchanged.
Actual results and tested SHA are recorded in the PR, not inferred here.

No migration or dependency; branch starts directly from develop. Revert this
package via reviewed PR. Queue payloads and processing behavior are unchanged.
