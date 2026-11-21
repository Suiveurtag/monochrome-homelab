---
name: Monochrome Social — Le Livret commun
description: The Social surface of the self-hosted Monochrome music club as the group's shared liner-notes booklet — every post a spread where a cover and a member's note answer each other across a fold, each entry printed in one flat spot ink read from its cover.
colors:
    ground: '#0a0a0a'
    ink: '#f5f5f5'
    card: '#141414'
    ink-soft: '#a0a0a0'
    paper: '#0f0f0f'
    paper-deep: '#0c0c0c'
    note-ink: 'color-mix(in oklab, #f5f5f5 90%, #c9b8a6)'
    rule: 'color-mix(in oklab, #f5f5f5 10%, transparent)'
    rule-strong: 'color-mix(in oklab, #f5f5f5 20%, transparent)'
    wash: 'color-mix(in oklab, #f5f5f5 5%, transparent)'
    wash-strong: 'color-mix(in oklab, #f5f5f5 10%, transparent)'
    house-ink: 'color-mix(in oklab, #a0a0a0 45%, #a08f99)'
    bubble-other: 'color-mix(in oklab, #f5f5f5 8%, #0c0c0c)'
    bubble-own: 'color-mix(in oklab, #f5f5f5 15%, #0c0c0c)'
    live: '#5ee890'
    like: '#ff5470'
typography:
    display:
        fontFamily: "Switzer, Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '2.1rem'
        fontWeight: 700
        lineHeight: 1
        letterSpacing: '-0.03em'
    headline:
        fontFamily: "Switzer, Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '1.2rem'
        fontWeight: 700
        lineHeight: 1.2
        letterSpacing: '-0.015em'
    credits-title:
        fontFamily: "Switzer, Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '1.08rem'
        fontWeight: 700
        lineHeight: 1.14
        letterSpacing: '-0.015em'
    note-spread:
        fontFamily: "Literata, Georgia, 'Times New Roman', serif"
        fontSize: '1.24rem'
        fontWeight: 400
        lineHeight: 1.45
        letterSpacing: 'normal'
    note-solo:
        fontFamily: "Literata, Georgia, 'Times New Roman', serif"
        fontSize: '1.14rem'
        fontWeight: 400
        lineHeight: 1.58
        letterSpacing: 'normal'
    note-short:
        fontFamily: "Literata, Georgia, 'Times New Roman', serif"
        fontSize: '1.36rem'
        fontWeight: 400
        lineHeight: 1.42
        letterSpacing: '-0.005em'
    note-comment:
        fontFamily: "Literata, Georgia, 'Times New Roman', serif"
        fontSize: '0.94rem'
        fontWeight: 400
        lineHeight: 1.55
        letterSpacing: 'normal'
    name:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.92rem'
        fontWeight: 650
        lineHeight: 1.3
        letterSpacing: 'normal'
    message:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.95rem'
        fontWeight: 400
        lineHeight: 1.45
        letterSpacing: 'normal'
    meta:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.8rem'
        fontWeight: 400
        lineHeight: 1.3
        letterSpacing: 'normal'
        fontFeature: '"tnum"'
rounded:
    person: '50%'
    pill: '999px'
    message-composer: '22px'
    modal: '16px'
    panel: '14px'
    card: '12px'
    spread: '10px'
    field: '8px'
    row: '6px'
    sleeve: '4px'
    sleeve-small: '3px'
    bubble-other: '16px 16px 16px 6px'
    bubble-own: '16px 16px 6px'
spacing:
    view: '1.25rem'
    stream: '2.75rem'
    rail-gap: '2.5rem'
    entry: '1.1rem 0 1.15rem'
    page: '1.05rem 1.2rem 1rem 1.35rem'
    credit: '0.45rem 0.55rem 0.55rem 0.45rem'
    row: '0.55rem 0.55rem 0.55rem 0.5rem'
components:
    listening-band:
        backgroundColor: '{colors.paper}'
        rounded: '{rounded.panel}'
        padding: '0.5rem'
    band-credit:
        backgroundColor: 'transparent'
        textColor: '{colors.ink}'
        rounded: '{rounded.spread}'
        padding: '{spacing.credit}'
        width: '236px'
    band-credit-hover:
        backgroundColor: '{colors.wash}'
    credit-sleeve:
        rounded: '{rounded.sleeve}'
        size: '54px'
    credit-action:
        backgroundColor: '{colors.paper}'
        textColor: '{colors.ink}'
        rounded: '{rounded.person}'
        size: '32px'
    credit-action-hover:
        backgroundColor: '{colors.ink}'
        textColor: '{colors.ground}'
    social-tab:
        backgroundColor: 'transparent'
        textColor: '{colors.ink-soft}'
        padding: '0.4rem 0 0.7rem'
    social-tab-active:
        textColor: '{colors.ink}'
    post-composer:
        backgroundColor: '{colors.paper}'
        rounded: '{rounded.panel}'
        padding: '0.65rem 0.65rem 0.65rem 0.75rem'
    button-post:
        backgroundColor: '{colors.ink}'
        textColor: '{colors.ground}'
        rounded: '{rounded.pill}'
        height: '40px'
        padding: '0 1.15rem'
    button-post-disabled:
        backgroundColor: '{colors.wash-strong}'
        textColor: '{colors.ink-soft}'
    spread:
        backgroundColor: 'color-mix(in oklab, var(--spot) 9%, {colors.paper})'
        rounded: '{rounded.spread}'
    spread-page:
        padding: '{spacing.page}'
    spread-play:
        backgroundColor: '{colors.ink}'
        textColor: '{colors.ground}'
        rounded: '{rounded.person}'
        size: '46px'
    tracklist-row:
        backgroundColor: 'transparent'
        textColor: '{colors.ink}'
        rounded: '{rounded.row}'
        height: '36px'
    post-action:
        backgroundColor: 'transparent'
        textColor: '{colors.ink-soft}'
        rounded: '{rounded.pill}'
        height: '36px'
        padding: '0 0.6rem'
    comment-input:
        backgroundColor: '{colors.paper}'
        textColor: '{colors.note-ink}'
        rounded: '{rounded.pill}'
        height: '38px'
        padding: '0 0.9rem'
    correspondence-desk:
        backgroundColor: '{colors.paper}'
        rounded: '{rounded.panel}'
        width: '300px'
    chat-row:
        backgroundColor: 'transparent'
        textColor: '{colors.ink}'
        rounded: '{rounded.spread}'
        padding: '{spacing.row}'
    chat-row-hover:
        backgroundColor: '{colors.wash}'
    chat-row-active:
        backgroundColor: '{colors.wash-strong}'
    messages-view:
        backgroundColor: '{colors.paper-deep}'
        rounded: '{rounded.panel}'
    message-bubble-other:
        backgroundColor: '{colors.bubble-other}'
        textColor: '{colors.ink}'
        rounded: '{rounded.bubble-other}'
        padding: '0.5rem 0.75rem 0.45rem'
    message-bubble-own:
        backgroundColor: '{colors.bubble-own}'
        textColor: '{colors.ink}'
        rounded: '{rounded.bubble-own}'
        padding: '0.5rem 0.75rem 0.45rem'
    sleeve-card:
        backgroundColor: 'color-mix(in oklab, var(--spot) 14%, {colors.paper})'
        rounded: '{rounded.card}'
        padding: '0.4rem 0.5rem 0.4rem 0.4rem'
        width: '340px'
    snippet:
        backgroundColor: 'color-mix(in oklab, var(--spot) 14%, {colors.paper})'
        rounded: '{rounded.card}'
        padding: '0.5rem 0.6rem 0.5rem 0.5rem'
        width: '360px'
    message-composer:
        backgroundColor: '{colors.paper}'
        rounded: '{rounded.message-composer}'
        padding: '0.3rem 0.3rem 0.3rem 0.35rem'
    group-modal-card:
        backgroundColor: '{colors.paper}'
        textColor: '{colors.ink}'
        rounded: '{rounded.modal}'
        padding: '1.2rem'
        width: 'min(420px, 100%)'
---

# Design System: Monochrome Social

> **Boundary.** This file documents ONLY the Social surface: `#page-social` (header, listening
> band, Feed view with its correspondence desk, Messages view, details panel, friendship gate) and
> its body-level group modal and lightbox, all styled by `social.css` and rendered by
> `js/social.js`, `js/social-feed.js`, `js/social-band.js` and `js/social-dom.js`; plus the Admin
> and Listening Stats addenda below. The global share sheet and the social widgets on member
> profiles are outside this redesign and keep their existing styles in `styles.css`. Everything else
> in the app (player, library, sidebar, Now Playing panel) is undocumented here. Hex values below
> are the `monochrome` default theme; the build expresses every neutral through theme tokens
> (`--background`, `--foreground`, `--card`, `--muted-foreground`, `--font-family`,
> `--font-family-key`) mixed into the `--lv-*` tokens on `#page-social, .social-group-modal,
> .social-lightbox`, so all ten themes render. The light `white` and `latte` themes override paper
> (card 38% / 14%), note ink (toward `#6b4a33`), shade, lift, and like-red (`#c8173c`, since
> `#ff5470` reads at 2.8:1 on light paper). On `latte`, whose muted ink falls under 4.5:1 on tinted
> paper, the page's inks step down one shade: `--lv-ink` is the foreground 72% toward black and
> `--lv-ink-soft` is the theme foreground. The spot ink mixes toward `--lv-ink`, never raw `--foreground`.

## Overview

**Creative North Star: "Le Livret commun"**

Social is the group's shared liner-notes booklet, not a chat timeline or a card feed. A music post
is a spread: the cover on the left page, the record's credits and the member's note on the right,
a soft shadow at the fold between them. The right page carries the record's running order printed
as on the back of a sleeve, or its running groove (the track's real waveform), and both play from
the exact track or moment clicked. Above the feed, a single-row listening band lists who is
playing what as credits: a round face on the corner of a square sleeve, a name, a track, a live
hairline following their real position. At wide containers a correspondence desk beside the feed
lists recent conversations, and Messages keeps the messenger fundamentals (rail, thread, docked
composer, details panel) with every row wearing the sleeve of its last shared record.

The material is paper and ink. Paper plies come from the theme tokens; text is foreground ink;
members' own words are set in a book face (Literata) in a faintly warm note ink. Each entry is
printed in one spot ink: the cover's own color, read once and laid flat into tints, borders,
running numbers and the groove, never as glow. Where there is no art, a muted mauve house ink
stands in. Two fixed signal hues remain, each with one meaning: presence green for someone here
now, like-red for a liked post.

Motion is the booklet being handled: one strong ease-out for UI, a smooth ease-in-out for things
travelling across the screen, a drawer curve for the details panel, and a slight overshoot only on
tactile gestures. A new entry's right page swings down onto the fold; pointing at a cover lifts the
left page from it.

**Key Characteristics:**

- Posts as spreads: square cover left (37% of the spread), credits and note right, a gutter shadow at the fold
- One flat spot ink per entry from its cover (`--tint`), the house ink without art; no glow
- Records are square (3-4px corners), people are round; a face sits on its sleeve's corner
- Literata for members' notes only; Switzer for titles and credits; Inter for the interface
- Hairline rules at 10% / 20% ink, tabular running times, no uppercase labels
- Listening band of credits in one scrolling row; correspondence desk at 300px from a 1040px container
- Container queries on `#page-social`, never viewport media queries, for layout
- Spring only on tactile gestures; reduced motion keeps color and opacity, drops travel

## Colors

Theme paper and foreground ink, one flat spot ink per entry, two reserved signal hues.

### Primary

- **Ink** (`{colors.ink}`, `var(--foreground)`): the action color and the type. Solid fill of the
  Post button, the spread's play disc, the tab thumb, the unread count, hovered credit actions and
  followed states, the groove cue line, the read double-check and the pinned pin. Text on ink is
  always the ground.

### Secondary

- **Spot Ink** (runtime, `--tint` → `--spot`, with `--spot-ink` = spot 58% into foreground): the
  cover's vibrant color via `coverColor()` (`getVibrantColorFromImage`, cached per image URL, 96
  entries; `cachedCoverColor()` prints a rebuilt node at once). It tints the spread (9% into paper,
  border 16%, cover well 18%), sleeve cards and snippets (14%, border 22%), info decks (15%), the
  tracklist and groove rules (30%), track numbers and the current track title (`--spot-ink`),
  tracklist hover (16%), the credit's live hairline, and the groove waveform. Tint changes settle
  over 700ms.
- **House Ink** (`{colors.house-ink}`): the spot ink when no cover color was read, and always for
  photo posts. Also the text-selection tint at 50% into ground.

### Tertiary

- **Presence Green** (`{colors.live}`): someone is here now. The header pulse dot (2.4s ping), the
  7px live dot before "Listening now" (3px halo at 18%), the online presence dot, and the 3.5px ring
  around a live avatar in Messages.
- **Like Red** (`{colors.like}`): the liked heart, its fill and the burst ring. Nothing else.

### Neutral

- **Ground** (`{colors.ground}`, `var(--background)`): the page and text on ink fills.
- **Paper** (`{colors.paper}`, card 52% into ground): the band, composers, the desk, the rail, the
  details panel, the group modal card.
- **Paper Deep** (`{colors.paper-deep}`, card 24% into ground): the Messages view, empty sleeves,
  photo wells, bubble bases.
- **Note Ink** (`{colors.note-ink}`): the warm off-ink of members' words: notes, comments, the
  composer's text, the details "about" line.
- **Rules** (`{colors.rule}` / `{colors.rule-strong}`): every panel edge and entry divider / stream
  heads, focused fields, dashed absences.
- **Washes** (`{colors.wash}` / `{colors.wash-strong}`): hover fills / active rows, pressed tools,
  search fields on focus, disabled Post.
- **Bubbles** (`{colors.bubble-other}` / `{colors.bubble-own}`): ink at 8% / 15% into paper deep.
- **Ink Soft** (`{colors.ink-soft}`, `var(--muted-foreground)`): bylines, handles, times, idle
  icons, inactive tabs, placeholders.
- **Shade** (`rgb(0 0 0 / 0.32)`, 0.12 on light themes): the fold gutter and sleeve shadows.

### Named Rules

**The Flat Spot Ink Rule.** Each entry is printed in exactly one spot ink, its cover's color through
`--tint`, or the house ink. It is laid flat as tint, border, numeral or waveform; it never glows,
blurs, or casts light.

**The Cover-Never-Marks-State Rule.** A spot ink says which record, never whether someone is live,
unread, selected or followed. State is ink, wash, weight, or presence green.

**The One Meaning Rule.** Presence green means a human is here now; like-red means liked. Neither
appears anywhere else, and no other fixed hue may carry a state.

## Typography

**Display Font:** Switzer (via `--lv-display` = `var(--font-family-key)`, falling back to Inter)
**Body Font:** Inter (via `var(--font-family)`, with Noto Sans per-script fallbacks and system-ui)
**Notes Font:** Literata (via `--lv-notes`, self-hosted variable 400-700 from
`public/fonts/literata/`, latin and latin-ext subsets, `font-display: swap`; Georgia fallback)

**Character:** three voices, three jobs. Literata is the members' handwriting in print: only their
own words. Switzer sets what a sleeve would print: titles, credits and headings. Inter runs every
control, name, time and label at small confident weights. Hierarchy comes from size, weight and
face, never case: the surface has no uppercase labels.

**Project gotcha.** `styles.css` forces `font-family` with `!important` on `*`. Any rule in
`social.css` that sets Switzer, Literata, or restores Inter (placeholders inside Literata fields)
must write `font-family: … !important` or it is silently ignored.

### Hierarchy

- **Display** (Switzer 700, 2.1rem, 1, -0.03em; 1.8rem below 560px): the "Social" title.
- **Headline** (Switzer 700, 1.05-1.25rem, -0.01 to -0.015em): stream titles ("Your circle"), desk
  and thread names, empty-state headings, details hero name, group modal title.
- **Credits Title** (Switzer 700, 1.08rem, 1.14, -0.015em, balanced; 1rem below 820px): the record
  title on a spread. The byline under it is Inter 0.9rem muted.
- **Note** (Literata 400, note ink, `pre-wrap`): on a spread 1.24rem/1.45 (1.1rem below 820px),
  outranking the title above it; a text-only note 1.14rem/1.58 at 62ch; a short text-only note
  1.36rem/1.42, balanced; comments 0.94rem/1.55; the composer field 1rem/1.5.
- **Name** (Inter 650, 0.84-0.92rem): post authors, credit names, comment and message authors.
- **Message** (Inter 400, 0.95rem, 1.45): bubbles stay in the interface face; conversation is not a
  note.
- **Meta** (Inter 400-650, 0.72-0.8rem, tabular figures): times, dates, counts, running times,
  track numbers, day lines (0.8rem/600).

### Named Rules

**The Notes Face Rule.** Literata sets only what a member wrote for the booklet: feed notes, the
post composer's text, comments and the comment field, a member's "about" line. Placeholders,
messages, names and controls stay Inter.

**The Credits Rule.** Switzer appears only on titles and headings; it never sets body, names or
controls.

**The Tabular Readout Rule.** Every time, position, count and track number uses
`font-variant-numeric: tabular-nums`.

## Layout

`#page-social` is capped at 1180px, centered, and is a named size container
(`container: social / inline-size`). The Now Playing panel and sidebar make viewport width a lie, so
every layout change is a container query on `social`; the only media queries are
`(hover: none)`, `(hover: hover) and (pointer: fine)` and `prefers-reduced-motion`.

- **Header:** title and presence summary on one baseline, tabs at the end; stacks below 560px.
- **Listening band:** one scrolling row (scroll-snap, `--fade-start` / `--fade-end` masks only on
  the side still hiding credits) of 236px credits (212px below 560px), then a quiet stack of
  overlapping 30px faces with "N quiet lately". Hidden in Messages.
- **Feed:** a single column (feed max 780px) with the composer, then streams 2.75rem apart. From a
  1040px container a 300px correspondence desk joins on the right (2.5rem gap), sticky at 0.5rem.
  Entries are separated by hairlines and grouped under one date line per day.
- **Spread:** grid `minmax(0, 37%) minmax(0, 1fr)`; 34% below 820px; a fixed 104px cover below
  560px, where track running times drop. Text-only notes indent to the byline (32px + 0.65rem).
- **Messages:** one 14px panel, grid `300px minmax(0, 1fr)`, `320px` details column with
  `.has-info`, height `clamp(460px, calc(100dvh - 268px), 980px)`.
- **Container breakpoints:** min 1040px adds the desk; max 1100px docks the details panel as an
  overlay (`min(340px, 88%)`); max 820px narrows the rail to 260px and the spread cover to 34%;
  max 640px shows one Messages pane at a time with a back button, the panel full width, stacks at
  86%; max 560px stacks the header, slims the composer (34px avatar, tools on row two), and fixes
  the spread cover at 104px.
- **Touch:** under `(hover: none)` credit actions sit statically under the copy, the spread play
  disc stays visible, the message pin rests at 0.55.
- **Rhythm:** 1.25rem below header and band, 2rem to the feed, 2.75rem between streams, 1.1rem per
  entry, 0.85rem inside a page.

### Named Rules

**The Container Knows Rule.** Layout responds to `@container social`, never a viewport media query.

**The Clip-Not-Hide Rule.** Spreads, credits and the Messages view use `overflow: clip`, never
`hidden`, so focusing a field can never scroll a pane sideways.

## Elevation & Depth

Flat paper with tactile objects on it. Panels sit on the ground with a 1px rule and no shadow.
Sleeves are physical objects and carry a small shade; the fold of a spread is a soft gradient on
both sides of the gutter. A lift shadow appears only on a focused composer. Floating overlays use
the opaque recipe (`background-color: var(--background)` plus a `linear-gradient` of paper) with
large soft shadows.

### Shadow Vocabulary

- **Fold** (`linear-gradient(to left, var(--lv-shade), transparent)`, 22px on the cover's edge;
  18px at half shade on the page's edge): the gutter of every spread.
- **Sleeve** (`0 0 0 1px var(--lv-rule), 0 6px 14px var(--lv-shade)`, deepening to `0 10px 20px`
  on hover; small sleeves `0 4px 10px var(--lv-shade)`): covers in the band, cards, snippets,
  rows.
- **Lift** (`--lv-lift`: `0 10px 28px rgb(0 0 0 / 0.28)`): composers on `:focus-within`, with the edge at ink 45%.
- **Play disc** (`0 8px 20px rgb(0 0 0 / 0.3)`): the ink play button over a cover.
- **Docked details** (`-24px 0 60px rgb(0 0 0 / 0.3)`): the details panel as an overlay below 1100px.
- **Group modal** (`0 30px 90px rgb(0 0 0 / 0.45)`, scrim `rgb(0 0 0 / 0.55)`, z 90) and
  **lightbox image** (`0 40px 120px rgb(0 0 0 / 0.5)`).
- **Ink rings** (`0 0 0 3-4px`, ink 30% or wash-strong): focus on fields, the composer summon, the
  groove cue flash. Ink, never spot.

### Named Rules

**The Flat Paper Rule.** Panels never cast shadow at rest; only sleeves (objects) and the fold
(a crease) do. Lift is a response to focus.

## Shapes

Records are square; people are round; paper is softly cut.

- **Round (50%):** avatars, faces, presence dots, the play disc, credit actions, the send button.
- **Square sleeves (4px; 3px small):** every cover, sleeve art, snippet art, picker art, the
  empty-state sleeves. A spread's cover is square (`aspect-ratio: 1`) inside the spread's clip.
- **Person on record:** a round face (28px, 2px paper ring) sits on the lower-right corner of a
  square sleeve in the band; in conversation rows the face sits in front, the sleeve tucked behind
  the shoulder at 56%.
- **Pills (999px):** Post, post actions, the comment field, search, the unread count.
- **Panels (14px):** band, post composer, desk, Messages view. **Cards (12px):** sleeve cards,
  snippets, message images. **Spreads and rows (10px):** spreads, credits, chat rows, info decks.
  **Modal (16px).** **Message composer (22px).** **Tracklist rows (6px).**
- **Bubbles:** 16px with a 6px tail corner toward the speaker.
- **Dashed outlines** (1.5px, rule-strong) mark absence: your blank sleeve in the band.

## Components

### Header

"Social" in Switzer with the presence summary on its baseline (pulsing green dot, tabular "1
listening, 2 online"). Feed / Messages are line tabs at 1rem/600, muted until selected, with a
fixed 100px, 2px ink thumb the script slides and scales on transform alone (340ms `--lv-move`).
The unread count is an ink pill.

### Listening band (signature)

- **Credit:** a 62px art well holding a square sleeve and the member's round face on its corner,
  then name, track and a state line ("Listening now" with the live dot, "Paused", or a dated last
  listen). A 2px hairline at the foot follows the friend's real position in `--spot-ink`.
- **Hover:** the sleeve tilts (-2px, -2deg) and deepens its shade, the face steps out, a dark cue
  shows play; 32px round actions (Listen along, Message or Follow) slide in over a paper fade.
- **Join:** listening along presses the sleeve (`lv-join`, 560ms spring) and flashes the hairline.
- **Your credit:** a dashed blank sleeve with a plus to share what you play.
- **Quiet:** members without a recent listen collapse to overlapping grayscale faces.

### Composer

A 14px paper panel: 40px avatar, an autosizing field set in Literata in note ink (placeholder in
Inter), track and image tools, an ink Post pill that arms with a spring when content appears.
`:focus-within` turns its edge to ink at 45% and adds the lift. Sharing from your credit summons it with an
ink ring.

### Spread (signature)

- **Left page:** the square cover over a spot-tinted well, a 22px fold shade at its right edge;
  pointing lifts it from the fold (`rotateY(-7deg) scale(1.015)`); a 46px ink play disc rises in
  on hover or focus.
- **Right page:** credits (Switzer title, Inter byline), the member's note in Literata at 1.24rem,
  then a tracklist (numbers in spot ink, current track in spot ink with three moving bars, hover
  wash 16% spot, "N more" link) or a groove (the real waveform printed left-to-right over 900ms,
  cue line on hover, tabular time). Both play from the clicked track or moment.
- **Entry:** a new spread fades in and its right page swings down onto the fold (560ms).
- **Photo posts:** house ink; without a note the photo sits on the page alone at 10px.
- **Text-only notes:** no spread; the Literata note indented to the byline, larger when short.

### Post actions and comments

Heart, comment and share as 36px muted pills with tabular counts, ink on wash when hovered. Liking
turns the heart like-red and filled with a 520ms spring pop, a burst ring and a count tick.
Comments unfold under the entry in Literata; the comment field is a paper pill in note ink.

### Correspondence desk and conversation rows

The desk (from 1040px) is a sticky 300px paper panel: "Messages" in Switzer, compact rows, "All
messages". Rows are 50px faces (44px compact) with the last shared sleeve tucked behind the
shoulder, name, preview and date; hover washes 5%, the active row sits on a sliding 10% wash
indicator, and the sleeve turns out (6deg). Unread rows go 750 weight with ink preview and an ink
count that pops. Live avatars wear a green ring; presence dots are 12px on a paper ring.

### Thread and messages

Day spacers are muted labels between hairlines. Bubbles have no border or shadow, ink 8% / 15% into
paper deep, a 6px tail corner. Arrivals slide 8px from the left (260ms), sends rise 10px. The foot
holds a tabular clock and ticks: pending at 0.6, delivered muted, read ink; a tick change stamps.
A pin waits beside each bubble on hover and drops in with a spring when pinned. A shared record is
its own sleeve card, not a bubble; a snippet is a 64px sleeve, play control, and a groove with its
range.

### Message composer

A 22px paper capsule docked under the thread: tools, an Inter field, a 38px round send that arms
with a spring and launches its icon on send. Focus turns the edge to ink at 45% and adds the lift.

### Details panel and friendship gate

A third column (overlay below 1100px) on paper, entering 320ms on the drawer curve from 16px and
leaving in 200ms. A 76px face, Switzer name, the member's "about" line in Literata, mutual faces,
the current listen as an info deck in spot tint. Follow, unfollow and block land as a stamp (460ms
spring from 1.35x, -8deg); blocking draws a 2px ink strike and grays the face. The friendship gate
veils the thread with 84% ground and `blur(8px)`, a grayscale 72px face ringed by wash.

### Group modal and lightbox

Body-level overlays. The modal card is `min(420px, 100%)`, opaque recipe on paper, 16px, rising
340ms from 14px at 0.98 over a 200ms scrim; checking a person stamps the checkbox, a chosen picture
pops in. The lightbox veils and scales the image in.

### Motion grammar

- **UI:** `--lv-ease` `cubic-bezier(0.23, 1, 0.32, 1)`, 120-380ms for state, up to 560-900ms for
  page turns and prints, 700ms for spot ink settling.
- **On-screen travel:** `--lv-move` `cubic-bezier(0.77, 0, 0.175, 1)` for the tab thumb (340ms).
- **Drawer:** `--lv-drawer` `cubic-bezier(0.32, 0.72, 0, 1)` for the details panel (320ms in).
- **Gestures:** `--lv-spring` `cubic-bezier(0.34, 1.45, 0.64, 1)`, only on tactile gestures: like
  (520ms), send and Post arming (320ms), play press (320ms), follow stamp and read-check stamp
  (460ms), group checkbox check (380ms), pin drop (500ms), unread pop and group picture pop
  (380ms), listen-along join (560ms).
- **Real time:** the band's hairline advances linearly over 1s; equalizer bars move only while
  someone is actually hearing music.
- **View switch:** Feed and Messages slide 14px in 300ms, reversed when going back.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, every animation under `#page-social`,
  the modal and the lightbox runs once in 1ms (loops stop, entrances settle at once); transitions
  are limited to opacity, color, background-color, border-color and box-shadow, so nothing travels;
  hover transforms on sleeves, faces and images are removed.

## Do's and Don'ts

### Do:

- **Do** express every neutral through theme tokens via the `--lv-*` mixes; `#5ee890`, `#ff5470` (`#c8173c` on light themes) and the house ink's `#a08f99` are the only fixed hues.
- **Do** print each entry in one spot ink from `--tint`, falling back to the house ink, laid flat.
- **Do** draw records square and people round, and put a member's face on their sleeve's corner.
- **Do** set members' own words in Literata with note ink, titles and credits in Switzer, everything else in Inter, each with `font-family: … !important`.
- **Do** draw grooves from real decoded peaks, cached once per track.
- **Do** use `@container social` for every layout change, and `overflow: clip` on spreads and panes.
- **Do** keep the spring for tactile gestures and the ease-out curve for everything else, and make sure new motion degrades under the reduced-motion block.
- **Do** write class names as literals in JS so PurgeCSS keeps them.
- **Do** use `tabular-nums` on every time, position, count and track number.

### Don't:

- **Don't** let a spot ink glow, blur or cast light, or mark state (live, unread, selected, followed).
- **Don't** use presence green for anything but presence, or like-red for anything but likes.
- **Don't** shadow a resting panel; only sleeves and the fold carry shade.
- **Don't** round a cover into a disc or square off a person.
- **Don't** set messages, names, placeholders or controls in Literata.
- **Don't** add uppercase labels or kickers; hierarchy is size, weight and face.
- **Don't** fake waveforms or tracklists with placeholder bars or rows.
- **Don't** show credit actions, the spread play disc or the message pin at rest on pointer devices; they appear on hover or focus.

# Surface Addendum: Admin Control Room

> **Boundary.** This addendum documents only `#page-admin`, its local control-room shell, member
> ledger and inspector, policy ledgers, and sticky save state. It does not broaden, replace, or
> weaken the Social design system above; Social's colors, component rules, and motion limits remain
> authoritative inside Social. The Admin surface is the shipped option A operator-console direction,
> concept seed `f18fcf08`, with `.impeccable/mocks/admin-console-a.png` as its approved reference.

## Admin Overview

**Creative North Star: "The Calm Control Room"**

Administration is an operating surface, not an analytics dashboard. The composition uses one
contained shell and a sequence of attached ledgers: health first, then four compact metrics, member
access, permissions and features, and finally instance policy. The first viewport must preserve that
order so an operator can establish service state and act on member access before changing policy.

The material is matte and exact: ink-on-ink token surfaces, one-pixel rules, compact native controls,
tabular counts, and sentence-case operational copy. Resting content stays flat. The member inspector
and sticky save state are the only elements allowed to lift because each represents a temporary layer
above the ledger.

**Key Characteristics:**

- One 1460px-capped operator shell with a local rail and a minmax workspace
- Status ribbon, metric strip, member table, and policy rows built as aligned ledgers, not card mosaics
- Member access precedes permissions, features, and instance identity in the document order
- Container-driven reflow at 1040px, 800px, and 560px
- Attached inspector at wide sizes, edge overlay in constrained columns, modal drawer on phones
- Semantic color is reserved for health, pending attention, and destructive outcomes
- Explicit labels, focus return, live feedback, and a complete reduced-motion path

**The Ledgers Before Cards Rule.** Operational information is organized by shared edges and row
dividers. Do not turn metrics, members, switches, or instance policy into a decorative card grid.

## Admin Colors

The Admin surface inherits every neutral from the active Monochrome theme. Foreground ink owns
primary actions and checked switches; `var(--border)` and low-alpha highlight washes own structure
and interaction state.

- **Healthy / active:** `#5ee890` is reserved for a connected service, active member, successful save,
  or current online state. A green dot is always paired with text such as "Instance online",
  "Healthy", or "Active".
- **Attention / pending:** `#e3b35f` marks degraded health, pending access, and warning-bearing controls.
  It means operator attention, never decoration.
- **Unknown:** `var(--muted-foreground)` carries checking and unavailable-to-evaluate states.
- **Destructive:** `var(--destructive)` is reserved for suspended accounts, deletion controls, failed
  loads/saves, and destructive permission cues. Destructive account deletion remains a text-labelled,
  confirmed action; red never acts as the only warning.

**The Semantic Chroma Rule.** Admin may use green for healthy/success, amber for degraded/pending,
and the inherited destructive token for harmful or failed outcomes. Every colored state also needs
plain-language status copy.

## Admin Layout and Container Behavior

`#page-admin` is the named inline-size container `admin-page`. Its shell is capped at 1460px and uses
`220px minmax(0, 1fr)` columns inside a 16px clipped frame. The local rail is a section index, while
the workspace owns all vertical reading and action flow. Layout decisions respond to the Admin
container rather than the browser viewport so the console remains correct inside Monochrome's
variable content column.

- **Above 1040px:** the selected member inspector is an attached 290–340px column beside a member
  ledger that never shrinks below 520px.
- **At 1040px:** the rail narrows to 178px; the status ribbon becomes 2-by-2; policy ledgers stack;
  the inspector leaves the grid and overlays the table's right edge at `min(340px, 88%)`.
- **At 800px:** the shell becomes one column. The local rail turns into a sticky, horizontally
  scrollable index with its active marker moved to the bottom edge. Joined and role metadata leave
  the table, preserving member identity, status, and the inspect action.
- **At 560px:** the status ribbon stacks, metrics become a 2-by-2 strip, search spans both filter
  columns, the table becomes an identity-first three-column list, instance fields and the save state
  stack, and the inspector becomes a fixed edge drawer (`min(92vw, 360px)`, `100dvh`).

Inspector presentation is container-driven in CSS. Its modal semantics are activated by the shipped
`max-width: 560px` viewport check in JavaScript: `aria-modal` becomes true, background regions become
inert, and page interaction is restored on close.

**The Local Container Rule.** Reflow the rail, ledger metadata, inspector, and policy columns with
`@container admin-page`; do not add page-level horizontal overflow or infer usable width from the
viewport alone.

## Admin Elevation & Depth

The shell's `0 30px 80px rgb(0 0 0 / 0.16)` shadow separates the entire operator console from the
application, not one metric from another. Inline status, metric, table, and control rows stay flat
and use hairlines. The inspector uses the opaque overlay recipe with a leftward shadow
(`-24px 0 60px rgb(0 0 0 / 0.18)`), growing to `-28px 0 80px rgb(0 0 0 / 0.48)` as a phone drawer.
The sticky save state may use `0 14px 38px rgb(0 0 0 / 0.2)` because it floats above scrolling policy
content.

**The Local Lift Rule.** Only the shell, a displaced inspector, and the sticky save state receive
shadows. A resting metric, table row, or switch row never does.

## Admin Shapes

The shell uses a restrained 16px radius; attached ledgers and the status ribbon use 12–14px outer
corners; compact controls use 8–10px; avatars and switches use circles or full pills. Joined surfaces
share edges: the member toolbar owns only the top corners and the table shell owns only the bottom
corners. The wide inspector inherits the table's lower-right corner; the phone drawer is square to the
viewport edge.

## Admin Components and Accessibility

### Status ribbon and metric strip

The status ribbon is a labelled `role="status"` region. Each condition includes readable state text;
dots and semantic color supplement it. Metrics are four equal ledger cells with tabular numerals and
muted labels, divided by one-pixel rules rather than individual cards.

### Member ledger and filters

Member data stays a semantic `<table aria-label="Instance members">` with scoped column headers and
an `aria-live="polite"` body for load, empty, error, and refreshed states. Search, status, role, row
selection, and inspect actions have programmatic labels. Checkboxes use the foreground accent; self
selection is disabled. When columns collapse, identity and the explicitly labelled inspect action
remain available rather than converting the row into ambiguous tap-only chrome.

### Member inspector dialog

The inspector is labelled by the selected member's name and exposes dialog semantics at every size.
Opening it moves focus to the close control; Escape and the close control dismiss it; closing returns
focus to the originating member button. On phones it becomes modal, marks the surrounding Admin
regions inert, and restores them on exit. Self role/access changes are disabled and explained. Account
deletion requires confirmation, and the final administrator cannot be demoted or deleted.

### Policy switch ledgers and save state

Permissions and features are complete labelled rows: icon, title, explanatory sentence, and native
checkbox with `role="switch"`. Checked state uses foreground ink, while keyboard focus gets a 2px
`var(--ring)` outline with 3px offset. Instance inputs retain visible token-based focus treatment.
Save feedback is an `aria-live="polite"` sentence whose copy changes for saving, success, partial
failure, and failure; the sticky save bar rises 2px only while the form is dirty.

**The Meaning Beyond Color Rule.** Health, access, validation, and destructive state must remain
understandable when hue cannot be perceived: preserve the status words, control labels, confirmation
copy, disabled state, and live feedback.

## Admin Motion

Admin motion uses `cubic-bezier(0.22, 1, 0.36, 1)` and explains a state transition: the overview
reveals once over 440ms, the inspector slides 12px from the right over 280ms, and the bulk-action bar
rises 6px over 220ms. The 2.8s health pulse is the only Admin loop and is semantic, not decorative.
These Admin timings do not alter Social's separate motion contract above.

Under `prefers-reduced-motion: reduce`, every Admin animation and transition, including pseudo-elements,
is reduced to 0.01ms and a single iteration; scroll behavior becomes immediate. The inspector's
JavaScript scroll uses `auto` instead of `smooth` under the same preference.

**The State-Change Motion Rule.** Motion may reveal overview readiness, inspector attachment, bulk
selection, dirty policy state, or live health. It must never decorate idle ledger content, and every
new Admin transition must be covered by the scoped reduced-motion rule.


# Surface Addendum: Listening Stats

> **Boundary.** This addendum documents only `index.html#page-stats`, `listening-stats.css`,
> `js/listening-stats.js`, and `js/listening-stats-scene.js`. The frontmatter and Social rules above
> retain their Social scope; the Admin addendum retains its own scope. Stats consumes app tokens
> and adds artwork-derived local colors; its composition does not become a global rule.
> The approved B Scene contract, seed `5d21f129`, is recorded in
> `.impeccable/surfaces/listening-stats.md`. This replaces the earlier candidate-6 ledger expression.

## Overview

**Creative North Star: "The Listening Stage"**

Listening becomes a living stage built from the listener's music. The approved B Scene expression
uses an open split composition: a giant listening-time number on the left, actual album covers in
a spatial fan on the right, and a smooth activity curve flowing across the lower edge. Artwork
supplies the ambient color; inherited typography, controls, and theme surfaces keep it Monochrome.

The stage opens into denser analysis: On repeat rankings beside a rotation and hours rail, then
individual listening history. This local world follows the approved comp and quality bar rather
than the earlier neutral metric-strip design.

**Key Characteristics:**

- Actual listened-to covers, foreground orbit light, and blurred artwork atmosphere
- Oversized tabular minutes with three supporting counts; open stage before denser analysis
- Smooth colored SVG curve with visible tooltip and keyboard inspection
- Container-driven layout and a chart rebuilt when available width crosses 560px
- Quiet idle atmosphere, enhanced hover/focus light, coordinated entrances, and quiet refresh suppression

## Colors

App tokens remain authoritative for text, controls, panels, rules, and missing-art states:
`--foreground`, `--background`, `--card`, `--muted`, `--muted-foreground`, and `--border`.
`--highlight-rgb` remains the inherited comma-separated RGB triplet used for hover washes.

Three surface-local colors (`--stats-color-0` through `--stats-color-2`) are extracted from the
actual fan images with `getVibrantColorFromImage`, cached by image URL in a bounded 64-item cache,
and reset on each render. Extracted colors mix at 70% with foreground in OKLab before use; cached
colors are available before paint. Unavailable extraction falls back to foreground and foreground/background mixes (72% and 48%).
The same actual cover images form a blurred color field beneath the radial ambience: quiet at
0.2 opacity, rising to 0.43 with scene hover or focus and a small scale expansion. These local
colors feed comparison text, curve gradient, area fill, rotation swatches, and hour bars. Rotation supplements the three colors with foreground mixes,
muted foreground, and border; names and percentages accompany every swatch.

**The Stats Artwork Authority Rule.** Color comes from real listening artwork or inherited theme
fallbacks. Keep readable labels and numeric values alongside color; never invent categorical brand
colors or replacement cover images.

## Typography

**Display & Body Font:** the inherited `--font-family` (Inter with the application's script and
system fallbacks). Stats introduces no font family.

The main minutes count is heavy and tightly tracked (800, `clamp(4.5rem, 12cqi, 9rem)`, line-height
0.95, tracking -0.04em); narrow containers use `clamp(4rem, 20cqi, 7rem)`. The descriptor is lighter
(550, `clamp(1.25rem, 2.8cqi, 2.1rem)`; 1.5rem on phones). Supporting counts use 650 with
`clamp(1.4rem, 3cqi, 2rem)`; phone counts use 1.65rem. Tabular numerals stabilize metrics and ledgers.

The page title stays modest (1.7rem/750; 1.35rem at 560px), panel headings use sentence case
(1rem/650; 0.95rem on phones). The activity heading stays available to assistive technology while
visually hidden, leaving the curve integrated into the stage. Controls use
0.75rem/600, table text 0.8rem (0.76rem on phones), supporting text about 0.65–0.8rem.
SVG axis labels share the inherited font (14px in SVG coordinates).

**The Stats Scale Rule.** Listening time is the focal number. Preserve its readable descriptor,
secondary count labels, and inspectable detail rather than flattening the stage into equal cards.

## Layout

The page is a centered inline-size container capped at 1320px. Its stage uses a 44%/56% split and
minimum height of 290px. The artwork fan height is `clamp(250px, 28cqi, 330px)`; each cover is
capped at the smaller of 230px and 72% of that height, keeping tilted artwork within its footprint.
Its caption sits below the fan with an 18px top margin on desktop and mobile, keeping text clear
of rotated artwork. The isolated scene clips its own atmosphere and keeps decorative art inside
its bounds.
The activity curve overlaps the lower stage edge by 12px, without an enclosing analysis card; its
small Minutes/Streams pill floats at the upper right. On phones the stacked curve uses a 22px top
gap to keep controls and the artwork caption clear.

Below it, analysis uses a 58%/42% ranking/rail split with 12px gaps. Rotation and hour analysis
occupy separate panels in the right rail. History returns to a full-width flat ledger after 36px
and a hairline. Analysis panels use 20px padding; ordinary spacing continues to use app tokens.

- **At 900px container width:** analysis becomes one column; the rail becomes two columns;
  rotation uses a 100px donut; the fan retains its container-driven height.
- **At 560px container width:** the stage stacks number, artwork, caption, and curve; period
  segments fill their row and dates wrap below; the fan is 245px high; panels use 16px padding;
  the rail stacks vertically and rotation uses a 120px donut. Ranking time and history duration
  hide while identity, stream counts, dates, and actions remain. The album ranking column is hidden
  in this expression at all widths.
- **Chart geometry:** the SVG uses a 1000×160 desktop or 400×240 compact viewBox, with a 130px
  desktop / 210px phone display height. A ResizeObserver rebuilds the chart on crossing 560px,
  accounting for sidebar/player changes as well as viewport resizing.

**The Stats Available-Width Rule.** Reflow against the Stats container, not viewport assumptions.
Keep flexible identity content at `min-width: 0` and preserve the stage-to-analysis-to-history order.

## Elevation & Depth

Depth belongs to the artwork stage and inspection layer. The square covers cast a resting shadow
(`0 22px 40px rgb(0 0 0 / 28%)`) and lift with a stronger shadow on hover or focus
(`0 30px 45px rgb(0 0 0 / 35%)`). The hero play button and selected segments have small shadows;
the chart tooltip uses `0 5px 16px rgb(0 0 0 / 15%)`.

Analysis panels use an artwork-tinted diagonal card gradient (93% card at its starting stop),
one-pixel borders, a fine top-edge highlight, and no shadow. Hover/focus mixes the border toward
the first artwork color. Rankings and history keep quiet rules and hover washes. The application's
floating player remains outside scope.

## Shapes

The signature is a fan of square artwork with slight corners (3px), perspective, gentle opposing
rotations (4°, -13°, 12°), and a thin elliptical orbit drawn in front of the covers. One- and two-cover
layouts adapt the fan without creating missing artwork. Controls use pill segments, circular date arrows and hero play,
and inherited compact icon corners. Analysis panels use 16px corners; tooltip corners are 8px.
Ledger artwork keeps 5px corners or a circle for artists; hour bars round only their tops (3px).

## Components

### Period, date, and export controls

Day, Week, Month, Year, and Lifetime are native buttons with `aria-pressed` in a labelled group;
Week is the default. Previous/next, Today, and the labelled native date input change the anchor;
Lifetime disables date navigation. Refresh and JSON export retain native semantics. Export is
disabled during loading, locked, or failed states; feedback is a `role="status"` region.

### Listening stage and artwork

The heard-minute total includes period comparison text and labelled streams, artists, and active
days, followed by track/album/streak detail. The fan uses up to three real top-track covers and
excludes the app-icon fallback. Cover buttons and the most-played caption's play button replay
actual tracks. Mouse movement tilts the fan gently and positions a CSS light reflection; pointer
leave clears both. Hover/focus lifts a cover, reveals replay, and strengthens its reflection. The
orbit gains a moving foreground light only while hovered/focused and in view. Missing-cover and
empty-period guidance remains textual and theme-based.

### Activity, rotation, and hours

Minutes/Streams selects chart units. Cubic SVG segments form the smooth curve over quiet gridlines
and a fading area; a blurred copy of the same curve adds bloom that strengthens with stage hover
or focus. Its accessible heading remains in the document without a separate visible chart title.
Pointer, tap, or keyboard inspection selects a point, exposes its tooltip, and updates a polite
live caption. ArrowLeft/ArrowRight/Home/End navigate points. The tooltip duplicates
information from the accessible caption and is hidden from assistive technology. Rotation combines
a ring of rounded arc paths with linked artist names and percentage text, without artwork in its center. Stroke thickness is capped at 10 SVG units and adapts to tiny shares; gaps account for the rounded cap width. Only a sole positive entry renders a full circle. Musical stems under the activity curve interpolate that same curve rather than introducing data. Hour bars expose time and listening minutes
through accessible labels and update the readable hour note.

### Rankings and session ledger

Tracks/Artists/Albums selects a semantic table with caption and scoped headers. Identity, artwork,
counts, and explicit play/open actions remain aligned. History is a chronological session list
with track identity, semantic date/time, duration where space permits, and play controls; pagination
shows 30 sessions per page and disables unavailable directions.

### Feedback and access state

Loading, empty, retryable-error, and locked states explain what is happening. The 30-second heard-
audio qualification and all-stats/Year/Lifetime locks remain backend policy, including for admins.
Collection continues while visibility and export are locked; pauses and seeks do not inflate time,
and earlier device history is not reconstructed. This is separate from Admin's ordinary bypass.

### Focus and motion

Native controls receive visible foreground focus (2px, 3px offset); chart targets receive a visible
stroke. The Stats easing is `cubic-bezier(0.16, 1, 0.3, 1)`. Each tab visit starts a cancelable
420ms header/toolbar entrance (55ms toolbar delay), independently of network loading. On data
arrival, one 800ms opening phrase settles the number (580ms lateral arrival, 760ms count), fans
covers out from inward offsets (640ms, delay 40ms + 60ms per cover), and reveals artwork light
(760ms). Orbit drawing runs from 180–800ms, and curve/area/bloom from 160–760ms. Supporting metrics
start at 160/210/260ms, caption at 220ms, and analysis panels at 240ms. The orbit completion
clears entry styling. No entry transform remains over later hover/focus states; re-entry cancels
prior chrome animation. Retained data still receives the entry on a new visit, while ordinary
period changes keep 450ms count interpolation from the painted value and a 320ms content transition.

On first intersection, panel and history headers, legend items, and ledger rows receive a finite
380ms fade/translation with 24ms staggering capped at 168ms. Graph, ring, and hour reveals pause
until their section is in view. The ring draws over 650ms, hour bars over 500ms with 12ms staggering,
and rows over 450ms. Cover hover/focus lifts 12px; press scales native buttons to 0.95. Control
micro-transitions are generally 180–240ms.

The 10s ambient breathing loop runs only while its scene is in view. The 12s orbit-light loop is
visible and running only during artwork hover or scene focus while in view; idle covers do not
float. Loading placeholders pulse and refresh spins only in their relevant state. Document
visibility pauses scoped CSS animations; count-up settles to its final value when hidden. Quiet
updates suppress count-up, scene/cover/row entrances, first-intersection motion, and chart/donut/hour
reveals. Reduced motion disables scoped CSS animations and transitions including pseudo-elements,
skips count-up and pointer tilt, cancels chrome and intersection animations, clears the entry state, and keeps static cover
rotations. These local timings do not change Social or Admin motion.

## Do's and Don'ts

### Do:

- **Do** use actual listening artwork, local extracted colors, inherited theme tokens, and real counts.
- **Do** preserve labelled native controls, semantic tables, keyboard point inspection, live feedback,
  focus visibility, and reduced motion.
- **Do** verify the split stage and vertical phone scene against the approved B comp and quality bar,
  including content width reduced by the app shell/player.

### Don't:

- **Don't** restore the old four-equal-metrics strip, neutral-only chart, or 700px artist-analysis layout.
- **Don't** promote Stats artwork colors, scale, shadows, sentence-case headings, or motion into Social
  or Admin rules.
- **Don't** imply locks stop collection, admins bypass Stats locks, or old device history was backfilled.

### Stats navigation polish

Period, chart-unit and ranking selectors use a sliding pill (280ms), recalculated on container resize. Date labels and content replacement use cancelable 320ms opacity/translation transitions. During period/week requests, existing content remains dimmed and inert instead of collapsing to a skeleton; initial loads retain their announced skeleton. Quiet refreshes wait until navigation finishes and skip DOM replacement when payloads are unchanged, preserving point/hour inspection. Latest-response and account guards still enforce data boundaries. Pointer tilt runs at most once per animation frame; artwork extraction uses a bounded 64-item cache and reuses cached colors before paint. Reduced motion skips these effects. These changes are scoped to Listening Stats.
