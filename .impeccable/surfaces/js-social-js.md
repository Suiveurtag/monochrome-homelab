---
version: 1
slug: "js-social-js"
primary_target: "js/social.js"
related_targets: ["index.html","js/social-feed.js","js/social-booth.js","social.css"]
---

# Social — La Cabine (The Booth)

- Scope: `index.html#page-social` (header, booth, Feed view, Messages view, info panel, friendship
  gate, group modal, lightbox), `js/social.js`, `js/social-feed.js`, `js/social-booth.js`,
  `social.css`. Out of scope: the global share sheet, profile social widgets, sidebar, player.
- Mode: Operate. Replacement world for Social (the 2026-08 "Monochrome Clubhouse" ink-and-hairline
  world is retired as anti-reference). Every existing function stays; no PocketBase schema change.
- Direction: "La Cabine", seed `f7980571` (assigned candidate 4: DJ deck displays). Raised by the
  declined challengers: chrome deleted until hover/focus (Metro), states stamp onto bubbles (ticket
  wallet), cover colors never mark state (orienteering), three plies only (acetate manual), fixed
  per-member furniture (goods catalog).
- Approved composition (2026-10-27, user: "Fais un mélange des 3"): a mix of
  `.impeccable/mocks/social-booth/comp-a.png` (deck anatomy, feed track log),
  `comp-b.png` (Messages: collapsed booth strip, browse list tinted by last shared music, tinted
  thread, snippet as a mini deck) and `comp-c.png` (Feed hero: featured deck + full-track waveform
  + live playhead + Listen along, other decks on a shelf). Clicking a shelf deck promotes it to the
  featured slot.
- Memorable moment: a friend's cover spinning at their real playback position, its color spilling
  onto the page, one click to listen along from where they are.

## Grilled decisions (2026-10-27)

Booth is the page header on both tabs (large in Feed, 64px strip in Messages, morphing between).
Members: everyone but blocked accounts, you included; order live > online > recent; cap with +N.
Deck actions: Listen along (same track, at their extrapolated position when playing), Message
(or Follow when not mutual), name to profile; your own deck shares what you play into the composer.
Recency recedes: older last listen = smaller, desaturated, further back; >30 days or never = avatar
only at the edge; all-offline booth stays composed and dated. Conversations take the color of
their last shared music, else the contact's current track, else neutral. Messenger fundamentals
stay (list, thread, docked composer, details panel). Desktop first; mobile must not break.

## Comp record (sampled from pixels)

| Region | Comp value | Build |
| --- | --- | --- |
| Shell ground | #060606 / #0a0a0a | `var(--background)` |
| Booth ground | #0a0a0a–#0b0b0c, cover glow at ~6% | background + radial glows in `--deck-color` |
| Panels (composer, feed, list) | #121314–#151717 | `color-mix(var(--card) …, var(--background))` |
| Live ring Jon Bell / Luna | #14366d→#2f7bff / #e05535 | extracted vibrant color per cover |
| Waveform | #3f3159 purple → #87493c orange (cover colors) | canvas bars, cover color gradient |
| Live dot | #67e97c | presence green #5ee890 (state color, unchanged) |
| Listen along | #e4e4e4 fill, dark text | `var(--foreground)` fill |
| Own bubble / other bubble | #313030 / ~#252627 | foreground 14% / 7% mixes into card |

Type: Switzer (`--font-family-key`) 700 for the page title and featured track title (comp: ~32px
title, ~40px featured track); Inter for UI; tabular numerals for every time readout.
Corner language: 14px panels, 12px strips and bubbles, pills for actions, perfect circles for decks.
Line weights: 1px hairlines at border 60–70%; deck rings 3px (featured 4px).
Elevation: flat panels; glow only from live covers; floating overlays keep the opaque recipe.

## Inventory

| Ingredient | Medium |
| --- | --- |
| Deck discs (cover in a platter, ring, marker) | HTML img + SVG ring, CSS rotation |
| Featured waveform + playhead | canvas from real decoded peaks (cached), HTML playhead |
| Snippet / track strips in feed and chat | canvas or bar spans from stored or decoded peaks |
| Cover color glow | extracted color via `getVibrantColorFromImage`, CSS radial gradients |
| Booth strip (Messages) | same deck markup, compact state, FLIP morph |
| Conversation tint | CSS custom property from last shared cover |
| Covers, avatars | existing project/library assets only (no generated rasters) |
| Icons | Lucide factories |

No raster is produced for the build: every cover is the library's own artwork.
