# Optional response follow-up policy — #52

Default remains 24 hours. Authorized settings managers can choose 1–720 hours;
the checked-settings UI requires explicit acknowledgement that all existing open
requests will be recalculated. The server records the effective UTC instant and
audit details including hours and that acknowledgement. No policy is changed by
installing this release. This is operational follow-up guidance, not a commercial
SLA or a new request state machine.

List, overdue filter, export and dashboard use one deadline policy and equivalent
shared SQL/DTO calculations. First response is distinguished from a newer client
reply. An unanswered latest client message anchors the clock; otherwise a request
with no replies uses creation time. A staff reply clears it until a newer client
message. Closed/cancelled/archived requests are ineligible. Reopening preserves an
unanswered original anchor, so a reopened request may immediately be overdue.
`awaiting_info` alone does not prove a reply was sent; an actual staff reply makes
it waiting for the client. At the exact due instant it is due, then overdue once
the clock passes it, matching the previous strict comparison.

The UI displays deadline/type and policy-based overdue labels. Policy changes can
increase/decrease existing overdue counts immediately; recorded effectiveAt is
policy history context, not a reset of individual request clocks. No notifications
or state transitions were added.

Stacked on checked settings #46/PR #51 and complete export #44/PR #48. The local
integration-only commit `eba5b00` combines those prerequisites; the incremental
policy diff starts there. Review/merge predecessors first, PR base stays develop.
No changes to main/develop have been committed directly. Existing field-level
revision protection remains, including the documented legacy API limitation.

Tests cover strict boundary, first/new reply, staff response, close/archive/reopen,
invalid/unacknowledged settings and actual MariaDB dashboard/list agreement.
Actual SHA, browser results and full gates are recorded in the PR. Revert policy
code via reviewed PR or save an approved 24-hour value with explicit acknowledgement;
retain audit and additive predecessor revisions. No production action is performed.
