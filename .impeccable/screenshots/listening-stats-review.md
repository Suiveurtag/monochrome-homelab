# Listening Stats finish review

Disposition: **ship**. Remaining: **clear**.

| Material correction | Verdict |
| --- | --- |
| Desktop activity curve and artist rail share the first viewport | Resolved |
| Chart-area and hover alpha syntax matches inherited comma-separated RGB tokens | Resolved |
| Hourly bar heights preserve data proportions without percentage clipping | Resolved |
| Mobile chart axes and geometry remain readable | Resolved |
| Mobile calendar, previous/next and Today stay together | Resolved |

Reviewed at 1440×1100 and 390×844, including light theme and the ledger captures. The original direction contract is in `index.html` (seed `c0188367`). UI figures are synthetic fixtures in an isolated temporary PocketBase database.

Functional checks: chart measure/keyboard inspection, all periods, rankings, pagination, JSON export, admin long-term lock, admin full lock, and live policy updates. No page errors or horizontal overflow. Real audio verification confirmed zero streams before 30 heard seconds, one at 30.012495 seconds, no extra time during pause, and no seek-time credit.

Automated verification: Vitest 24 passing tests; Node 19 passing tests across listening aggregation/outbox, feature foundations and real PocketBase integration. Production build, changed-file lint and `git diff --check` pass.
