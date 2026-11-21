---
version: 1
slug: "js-social-js"
primary_target: "js/social.js"
related_targets: ["index.html","js/social-feed.js","js/social-band.js","social.css"]
---

# Social — Le Livret commun (the shared booklet)

- Scope: `index.html#page-social` (header, listening band, Feed view with its correspondence rail,
  Messages view, details panel, friendship gate), the body-level group modal and lightbox,
  `js/social.js`, `js/social-feed.js`, `js/social-band.js` (the listening band, replacing `js/social-booth.js`), `social.css`.
  Out of scope: the global share sheet, profile social widgets, sidebar, player.
- Mode: Operate. Replacement world for Social: "La Cabine" (DJ decks, discs, glow) is retired as
  anti-reference, as was the 2026-08 Clubhouse world before it. Every existing function stays;
  no PocketBase schema change.
- Audience and job: a handful of friends on one homelab instance. They come to see what the others
  play, leave a note about a record, answer each other, and slip into a conversation.
- Direction source: the 2026-11-20 direction round (`.impeccable/mocks/social-directions/decision.json`,
  sketches in `.impeccable/sketches/social-directions/`). The page closed unanswered and the user
  asked (2026-11-20, going to sleep) to work autonomously without prompts, so the assigned card
  "Le Livret commun" was built unattended. Alternates left open: L'Atlas nocturne, L'Index des
  échanges, and the familiar canon.
- Memorable moment: a friend's record laid open as a booklet spread, cover on the left page and
  their note on the right, its tracklist or running groove printed in the cover's own spot ink.

## Direction contract

THESIS: Social is the group's shared liner-notes booklet. Every post is a spread where a cover and a
member's note answer each other across a fold; it refuses the chat-bubble timeline and the card feed.

OWN-WORLD: Theme-token paper plies, foreground ink, one spot ink per entry read flat from its cover
(no glow), a house second ink when there is no art. Records are square, people are round. Literata
sets members' notes; Switzer sets credits and titles; Inter runs the interface. Hairline rules,
tabular running times, a soft gutter shadow at the fold.

STORY: See who is listening in the band, open a friend's spread, play from its tracklist or groove,
leave a margin note, then carry the thread into a conversation whose rows wear their last sleeve.

FIRST VIEWPORT: Title and Feed/Messages tabs; a single-row listening band of credits (avatar on a
square cover, name, track, live hairline); the composer as a blank entry; then the first spread at
full column width, cover left ~40%, note right. At wide containers a correspondence rail (300px)
lists recent conversations beside the feed.

FORM: Le Livret commun, the assigned lead card of the 2026-11-20 round. seed: none (no roll on record: this run inherited the assigned lead from a decision round that never recorded a roll, and a roll after the build would deal against a locked direction)

Signature interaction: a spread's tracklist and groove play from the exact track or moment
clicked; spot ink settles onto the page once the cover is read. Motion grammar: one strong
ease-out for UI (160-280ms), ease-in-out for on-screen movement, a slight overshoot only on
tactile gestures (like, send, follow stamp, pin), all of it reduced to opacity under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints carried over

Mutual friendship gates messaging, sharing and groups; feed keeps the followed stream first and a
non-duplicating instance stream below; no reposts; snippets play through the global player; no
call UI. Container queries on `#page-social` for layout; class names written as literals in JS for
PurgeCSS; every theme (ten, including light `white` and `latte`) must render.
