---
name: Monochrome Social
description: Token-driven social layer (feed, messages, groups, share sheet) for the self-hosted Monochrome music club — hairlines, ink-on-ink surfaces, presence green for the living.
colors:
    background: '#0a0a0a'
    foreground: '#f5f5f5'
    card: '#141414'
    muted: '#1f1f1f'
    muted-foreground: '#a0a0a0'
    border: '#2a2a2a'
    secondary: '#1f1f1f'
    highlight: '#f5f5f5'
    presence-green: '#5ee890'
    listening-white: '#ffffff'
    like-red: '#ff5470'
typography:
    display:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '1.45rem'
        fontWeight: 750
        lineHeight: 1.15
        letterSpacing: '-0.03em'
    title:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.84rem'
        fontWeight: 700
        lineHeight: 1.2
        letterSpacing: 'normal'
    body:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.9rem'
        fontWeight: 400
        lineHeight: 1.55
        letterSpacing: 'normal'
    message:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.82rem'
        fontWeight: 400
        lineHeight: 1.5
        letterSpacing: 'normal'
    meta:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.62rem'
        fontWeight: 550
        lineHeight: 1.3
        letterSpacing: 'normal'
    label:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.6rem'
        fontWeight: 750
        lineHeight: 1.3
        letterSpacing: '0.1em'
rounded:
    pill: '999px'
    workspace: '12px'
    card: '18px'
    frame: '14px'
    row: '13px'
    control: '12px'
    tool: '9px'
    bubble-other: '4px 16px 16px 16px'
    bubble-own: '16px 4px 16px 16px'
    bubble-grouped: '12px'
spacing:
    xs: '0.35rem'
    sm: '0.55rem'
    md: '0.8rem'
    lg: '1.1rem'
components:
    social-tab-active:
        backgroundColor: 'transparent'
        textColor: '{colors.foreground}'
        rounded: '0'
        padding: '0.75rem 0 0.72rem'
    social-primary-button:
        backgroundColor: '{colors.foreground}'
        textColor: '{colors.background}'
        rounded: '{rounded.pill}'
        padding: '0.42rem 1.05rem'
    social-chat-row-active:
        backgroundColor: 'rgb(var(--highlight-rgb), 0.09)'
        textColor: '{colors.foreground}'
        rounded: '{rounded.row}'
        padding: '0.55rem'
    social-unread-pill:
        backgroundColor: '{colors.foreground}'
        textColor: '{colors.background}'
        rounded: '{rounded.pill}'
        height: '17px'
        width: '17px'
    message-bubble-other:
        backgroundColor: '{colors.card}'
        textColor: '{colors.foreground}'
        rounded: '{rounded.bubble-other}'
        padding: '0.5rem 0.7rem 0.34rem'
    message-bubble-own:
        backgroundColor: 'color-mix(in srgb, var(--foreground) 12%, var(--card))'
        textColor: '{colors.foreground}'
        rounded: '{rounded.bubble-own}'
        padding: '0.5rem 0.7rem 0.34rem'
---

# Design System: Monochrome Social

> **Boundary.** This file documents ONLY the Social surface: `#page-social` (feed tab, messages
> workspace, info panel, group modal, lightbox), the global share-sheet overlay, and the social
> widgets on member profiles (follow button, stats, now-playing card). Everything else in the app —
> player, library, settings, the now-playing panel — is legacy/other and undocumented here.
> All values below are the `monochrome` default theme; every rule is expressed through the tokens
> listed in **Inherited tokens** so all ten themes (monochrome, dark, ocean, purple, forest, mocha,
> machiatto, frappe, latte, white) render correctly.

## Overview

**Creative North Star: "The Monochrome Clubhouse"**

A private club's noticeboard and mail room, drawn in a single ink. The Social surface never
introduces a palette of its own: surfaces are `var(--card)` over `var(--background)`, structure is
1px hairlines, and the _only_ accent is the foreground itself — buttons, the active tab underline,
unread pills, and the send button are all solid `var(--foreground)` ink on `var(--background)`
paper. Chroma is rationed to two meanings: presence green `#5ee890` says _a member is alive right
now_, and like-red `#ff5470` says _you loved this_. Nothing else on the surface may be colored.

Density is messenger-compact: small type (body text sits at 0.82–0.9rem), tight rows, and generous
use of uppercase micro-labels for wayfinding. Feed posts deliberately have no card boxes — the feed
uses a broad hairline-divided column with a compact live-activity rail — while the messages workspace
is the one big contained object on the page (a 12px-radius, hairline-bordered panel with three panes). Floating layers (share
sheet, group modal, lightbox, docked info panel) are opaque token surfaces with heavy soft shadows;
everything inline is flat.

Motion is short, eased, and sparse: 240–320ms `cubic-bezier(0.22, 1, 0.36, 1)`, one property per
move (a 6–7px rise or a 14px slide). Only two things loop forever — the presence pulse
(2.4s) and the listening equalizer (0.75s alternate) — and every animation and transition is
switched off under `prefers-reduced-motion: reduce`.

**Key Characteristics:**

- Foreground-as-accent: solid ink fills for primary actions, active states, and unread counts
- Two chromatic signals only: presence green `#5ee890` (alive) and like-red `#ff5470` (liked)
- Hairline-first structure; `rgb(var(--highlight-rgb), α)` washes (0.02–0.12) for hover/selected
- Feed = flat 720px stream plus a 240–280px live rail when space permits; messages = one contained 3-pane workspace
- Asymmetric bubble radii (4px toward the sender, 16px elsewhere; 12px when grouped)
- WhatsApp-style delivery ticks: clock = pending, double-check = delivered, accent double-check = read
- Opaque overlay recipe (`background-color: var(--background)` + `background-image: linear-gradient(var(--card), var(--card))`) for every floating card
- Info panel docks via a **container query** on `#page-social`, not a media query
- All JS-rendered markup goes through `escapeHtml`; re-renders are change-guarded (compare HTML before assigning)

**Inherited tokens (consumed, not redefined here):** `--background`, `--foreground`, `--card`,
`--card-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`,
`--border`, `--highlight`, `--highlight-rgb`, `--primary`, `--ring`, `--font-family`, plus the
global `--radius-*` / `--space-*` / `--shadow-*` scales of `styles.css :root`. The social section
itself mostly uses literal rem/px values tuned to this surface; the theme colors are always `var()`.

## Colors

One ink, two living signals. The palette is the theme's own neutrals; the social layer adds exactly
two fixed hues with reserved meanings, plus translucent washes of the theme highlight for state.

### Primary

- **Foreground ink** (`var(--foreground)`, `#f5f5f5` in the default theme): the accent. Solid fills
  on: Post/Follow/Send/Create buttons, unread pills (badge + count),
  the active-conversation indicator bar, snippet play buttons, in-range waveform bars, the
  listening presence dot, and the "Following"/pressed states of icon buttons. Inverted text
  on these fills is always `var(--background)`.
- **Highlight washes** (`rgb(var(--highlight-rgb), α)`): the entire state system. Resting tints at
  α 0.02 (rail + info panel background) and α 0.035–0.045 (empty-state mark, attachment/comment
  inputs, track cards, share-sheet item); hover at α 0.05–0.09 (rows, tools, info actions); selected
  at α 0.09–0.1 (active chat row, selected recipient, following state); strongest hover at α 0.1–0.12.

### Secondary

- **Card surface** (`var(--card)`, `#141414`): message bubbles, the messages workspace, composer
  bodies — usually lightened/darkened via `color-mix(in srgb, var(--card) 72–94%, transparent)` so
  the page background breathes through. Own bubbles mix 12% foreground into card; own bubble borders
  mix 22–26% foreground into border.

### Tertiary

- **Presence green** (`#5ee890`): reserved exclusively for "alive" signals — the header pulse dot
  (with a 2.4s `box-shadow` ring pulse at 45% alpha) and avatar presence dots in `is-online` state.
- **Listening white** (`#ffffff` + `0 0 9px rgb(255 255 255 / 0.55)` glow): the `is-listening`
  presence-dot state, meaning _this member is playing music right now_.
- **Like-red** (`#ff5470`): the liked heart only — text color plus `fill: currentcolor`, with the
  380ms heart-pop. Never used anywhere else.

### Neutral

- **Background** (`var(--background)`, `#0a0a0a`): page ground; also the text color on ink fills.
- **Muted foreground** (`var(--muted-foreground)`, `#a0a0a0`): handles, timestamps, previews,
  micro-labels, icons at rest, waveform bars out of range, placeholders.
- **Border** (`var(--border)`, `#2a2a2a`): every hairline. Dividers fade it to 55–72% via
  `color-mix(in srgb, var(--border) 62%, transparent)`; focus borders mix 26–34% foreground into it.
- **Muted** (`var(--muted)`, `#1f1f1f`): avatar and artwork placeholder backgrounds.
- **Secondary** (`var(--secondary)`): hover fill for legacy `.btn-icon` and the profile
  follow button's `is-following` state.

### Named Rules

**The Foreground-Is-the-Accent Rule.** The social surface has no brand hue. When something must
demand attention, it gets a solid `var(--foreground)` fill with `var(--background)` text — never a
new color.

**The Alive-Green Rule.** `#5ee890` means a human is present; `#ffffff` + glow means they are
playing. Neither may ever be decorative, and no other hue may carry a presence meaning.

**The Wash Ladder.** Interactive state is `rgb(var(--highlight-rgb), α)` only: rest 0.02–0.045,
hover 0.05–0.09, selected/active 0.09–0.12. Do not invent stronger fills.

## Typography

**Display & Body Font:** Inter (via `var(--font-family)`, with Noto Sans per-script fallbacks and
system-ui). No mono, no serif anywhere on this surface.

**Character:** One family, many weights — hierarchy is built from weight (550–800), size (0.5rem
micro-labels to 1.45rem page title), tracking (negative on titles, wide positive on uppercase
labels), and muteness. It reads like a well-set messenger: quiet labels, confident names.

### Hierarchy

- **Display** (750, 1.45rem, 1.15, -0.03em): the "Social" h1 only.
- **Title** (700–750, 0.84–0.98rem, tight, -0.015 to -0.02em): thread names, info-panel hero name,
  empty-state headings, share-sheet/modal card titles.
- **Body** (400–650, 0.9rem, 1.55): post text (`white-space: pre-wrap`, `overflow-wrap: anywhere`).
  Message text is one step smaller (0.82rem, 1.5).
- **Meta** (550–700, 0.56–0.72rem): handles, timestamps ("4h", "07:24 PM"), conversation previews,
  presence status lines, day-spacer labels (uppercase, 0.08em). Clocks and snippet ranges use
  `font-variant-numeric: tabular-nums`.
- **Label** (750–800, 0.5–0.62rem, 0.06–0.11em, UPPERCASE): the wayfinding voice — "PEOPLE" rail
  label, info-panel `h3` sections ("SHARED TRACKS", "MUTUALS & GROUPS", "PINNED"), attachment type
  chips ("TRACK", "ALBUM"), the Mutual tag, "PAUSED"/"LISTENING NOW".

### Named Rules

**The Micro-Label Rule.** Section headers inside panels are never sentence-case headings; they are
0.6rem/750 uppercase with 0.1em tracking in `var(--muted-foreground)`.

**Names Before Chrome.** Authors and titles are the heaviest things on screen (650–750 weight);
containers stay quiet.

## Layout

`#page-social` is a full-width container capped at 1380px, centered, and is itself a size
container (`container-type: inline-size`) so children can respond to the _workspace_, not the
viewport — necessary because the floating player panel eats horizontal space.

- **Feed tab:** a centered `720px + 240–280px` grid. The main stream stays flat and hairline-divided;
  the sticky secondary rail shows live friends and recent groups. At a 1050px container width the
  rail hides and the stream recenters.
- **Messages workspace:** the one big object — `display: grid`,
  `grid-template-columns: 280px minmax(0, 1fr)`, gaining a third `300px` column when the info panel
  is open (`.has-info`). Height is `clamp(540px, calc(100dvh - 274px), 980px)`. The rail (chats +
  people) and thread each scroll internally; the composer is docked at the thread's foot.
- **Info panel docking:** `@container (max-width: 1240px)` collapses the third column and floats the
  panel as a right-side overlay — `position: absolute; width: min(340px, 88%)` with a left hairline
  and `-24px 0 60px rgb(0 0 0 / 0.28)` shadow. At ≤640px it goes full-width, shadowless.
- **Responsive:** at ≤900px the workspace becomes one column — the rail shows until a thread opens
  (`.has-thread`), then the thread replaces it and a back chevron appears. At ≤640px the workspace
  height becomes `calc(100dvh - 250px)`, radius drops to 16px, and message stacks widen to 86%.
- **Rhythm:** spacing is rem-based and tight — 0.35rem between related bits, 0.55rem inside rows,
  0.8rem between avatar and copy, ~1.1rem between sections. Message rows sit 0.55rem apart and
  collapse to 0.14rem when grouped (same sender within 4 minutes).

### Named Rules

**The Container Knows Rule.** Panel docking responds to a container query on `#page-social`, never
a media query — the floating player makes viewport width a lie.

**One Big Object.** The feed is naked structure; the messages workspace is the single contained
panel. Don't card-ify the feed or unbox the workspace.

## Elevation & Depth

Flat by default, floating by exception. Inline surfaces have no shadows — depth is drawn with
1px `var(--border)` hairlines and highlight washes. Shadows appear only when something genuinely
levitates above the page, and they are large, soft, and dark:

### Shadow Vocabulary

- **Workspace** (`0 24px 70px rgb(0 0 0 / 0.18)`): the messages panel itself.
- **Composer focus** (`0 2px 6px rgb(0 0 0 / 0.08), 0 14px 38px rgb(0 0 0 / 0.14–0.16)`): both
  composers on `:focus-within`, paired with a foreground-mixed border.
- **Message bubble** (`0 1px 2px rgb(0 0 0 / 0.05)`): the only shadowed inline element, barely there.
- **Hover pin** (`0 3px 10px rgb(0 0 0 / 0.18)`): the message pin button that appears on hover.
- **Docked overlay panel** (`-24px 0 60px rgb(0 0 0 / 0.28)`): info panel over the thread.
- **Group modal** (`0 30px 90px rgb(0 0 0 / 0.4)`), **share sheet** (`0 34px 110px rgb(0 0 0 / 0.45)`),
  **lightbox image** (`0 40px 120px rgb(0 0 0 / 0.5)`): the floating family, scaled with z-index
  (90 / 92 / 95).

### Named Rules

**The Hairline-First Rule.** Reach for `1px solid var(--border)` before any shadow. A shadow on a
resting inline surface is a bug; shadows belong to things that float (workspace shell, overlays,
hover-revealed tools).

**The Opaque Overlay Rule.** Every floating card (group modal, share sheet, docked info panel)
uses the same recipe: `background-color: var(--background); background-image:
linear-gradient(var(--card), var(--card))` — an opaque, theme-proof surface that never lets the
page bleed through.

## Shapes

Pill for people-actions, rounded-rect for content, asymmetric for speech. Borders are 1px
`var(--border)` everywhere; avatars and presence dots are perfect circles with a 1px hairline (or a
2px `var(--card)` ring in the mutuals stack).

- **Pills (999px):** segmented tabs + thumb, Post/Follow/Send-to-friend buttons, unread pills,
  action-row buttons, comment input, snippet toggle, info actions, Copy link, Reset.
- **Workspace & cards (18–20px):** messages workspace 20px; feed composer, group modal card, share
  sheet card 18px (16px at ≤640px).
- **Content frames (12–14px):** post images 14px; share cards, snippet cards, image messages,
  lightbox image 12px; artwork tiles 7–10px.
- **Rows & tools (9–13px):** chat/person rows 13px; search fields, chips, send button 10–12px;
  small icon tools 8–11px.
- **Speech bubbles:** other = `4px 16px 16px 16px` (sharp top-left toward their avatar); own =
  `16px 4px 16px 16px` (sharp top-right); grouped messages in a run collapse to a uniform 12px.
  Image-only bubbles shrink padding to 0.28rem so the image owns the corner.
- **Empty-state mark:** a 64px hairline box, 22px radius, rotated -4deg — the one playful tilt in
  the system. The group tile is a _dashed_ 1px circle (solid 10px-radius square when small).

## Components

### Social header — title, presence summary, line tabs

- Compact identity row: "Social" h1 (1.45rem/750) with a live presence summary beneath
  (0.72rem/550 muted): a 7px `#5ee890` dot pulsing a 7px ring every 2.4s, then "1 listening · 2
  online" (or "Everyone is offline" / "Just you here for now").
- **Line tabs:** the same language as Settings and Search — two quiet labels on the header hairline,
  with a 2px foreground underline on the selected tab. Messages keeps its 17px unread pill.
  Focus-visible: 2px `var(--highlight)` outline.
- View swaps animate `social-view-in`: 320ms rise from `translateY(6px)` + fade.

### Feed composer

42px avatar + borderless autosizing textarea ("What are you listening to?", max 200px) on the page
itself. A single bottom hairline contains the
tools row: 32px icon tools (music-2, image-plus; radius 9px; hover = foreground color + wash 0.09 +
`translateY(-1px)`) and the Post pill (disabled at 0.35 opacity until there's text or an
attachment). Attachments render as 12px chips on wash 0.045 with a 38px thumb, uppercase type
label, and an X. The music picker unfolds as an inset panel (13px radius, `color-mix(var(--background)
55%, var(--card))`) with a search row, "Now playing" shortcut, and 36px-art result rows; searches
debounce 220ms.

### Feed streams and post

The feed is an editorial sequence, not one endless algorithmic list. **Your circle** comes first and
contains posts from accounts the member follows. **Across Monochrome** follows after a generous
section break and contains the rest of the instance, so no post is rendered twice. Each stream has
a plain title, one-line description, post count, and a compact author facepile with live presence
dots. Empty streams keep their heading and collapse to one quiet explanatory row.

No box. 42px round avatar, then a baseline head: author (0.86rem/700, underline on hover) · @handle
· relative time ("4h", tabular where numeric). Body 0.9rem/1.55 pre-wrap. Embedded music rides in a `social-post-card`
(max-width 430px) and images in a 14px frame capped at 440×420. The action row is up to three pill
ghost-buttons (heart / message-circle / share-2 when music is attached, 0.72rem/650 counts): hover = wash 0.08,
active = `scale(0.94)`. Liked heart turns `#ff5470`, fills, and pops (380ms: 0.6 → 1.25 → 1).
Comments expand inline (`social-view-in` 260ms) behind a 55%-opacity hairline: 26px avatars,
0.72–0.78rem copy, and a pill comment input on wash 0.045 whose border mixes 34% foreground on
focus. Row hover paints a whisper of wash (0.022) over the whole post.

### Messages workspace — rail

Left 280px rail on a card/background mix with a right hairline. Head: 36px fully rounded search field on
the page background; `:focus-within` mixes foreground into the border. Beside it is a 31px new-group
tool. Chat rows (8px radius): 42px avatar with presence dot, name (0.8rem/650) +
list time (0.6rem), preview (0.68rem, "You: " prefix for own last message), bell-off glyph at 0.7
opacity when muted, and a 17px foreground unread pill (99+ cap). Hover uses wash 0.06 without
movement; the active row holds wash 0.09 and a 3px×55% foreground bar on the left edge; unread
previews bold to 550. Presence dots: 10px, 2px `var(--card)` ring — offline = 55% muted-foreground,
online = `#5ee890`, listening = white with glow. Below, sentence-case section labels with member count,
then **Meet people** rows for members who do not already have a DM in the conversation list:
avatar + dot, name with an optional **Friend** tag (uppercase 0.5rem pill, wash 0.09), status line
("Listening · Breathe Deeper" / "Online" / "Offline"), a 3-bar equalizer
(2px bars, 0.75s alternate wave) when playing, and a 28px round follow button — hairline ring with
user-plus; hover inverts to solid ink + `scale(1.06)`; following = wash 0.1 with a check.

### Thread — header, day spacers, messages

Header: 38px avatar + presence dot, name (0.84rem/700) and status small ("Listening to · track" /
"Online now" / "Offline" / "N members"), bell (mute, `aria-pressed` fills it solid) and info icon
buttons; back chevron appears only ≤900px. The thread pane stays on the base background so people,
messages, and album art carry the visual interest. Day spacers: uppercase 0.62rem/700 labels
("TODAY", "YESTERDAY", weekday, or date) between
72%-opacity hairlines. Message rows animate in (240ms, `translateY(7px)`); other-sender rows lead
with a 30px bottom-aligned avatar (hidden but space-keeping when grouped) and, in groups, a 0.64rem
author link. Stacks cap at `min(74%, 560px)` (86% mobile).

**Bubbles:** `var(--card)` fill, hairline border, `0 1px 2px` shadow, asymmetric radii per Shapes;
own bubbles mix 12% foreground into the fill and 22% into the border; row hover deepens the border
to 26%. The foot is right-aligned: clock (0.56rem, tabular) plus delivery ticks for own messages —
**clock icon at 0.6 opacity = pending** (optimistic send), **double-check in muted = delivered**,
**double-check in `var(--foreground)` = read**. Hovering any row reveals a pin button (24px, 8px
radius, card fill, hairline, soft shadow) floating above the outer corner.

**Message content:** images render borderless in 12px frames (max 340px wide, 360px tall, cursor
zoom-in → lightbox). Music share cards are 54px-art + type-em/title/subtitle + play/open buttons in
a 12px card on `rgb(0 0 0 / 0.16)` (wash 0.1 on hover, dark play disc on art hover). **Snippet
cards** (12px, hairline mixed 16% foreground): 30px ink play disc, title/subtitle, a 96-bar
waveform (`downsamplePeaks` to 96; in-range bars solid foreground, the rest 26% foreground), and a
tabular "0:12 – 0:45" range line. Snippet plays are scoped with `new Audio()` start/end guards.

### Message composer

Docked foot: 16px-radius bar (`color-mix(var(--card) 94%, transparent)`, `0 10px 30px` shadow) with
image-plus and music-2 tools (36px, hover lift + wash 0.09), an autosizing textarea (38px resting,
140px max), and the 38px send button — solid ink, 12px radius, arrow-up, which _morphs to a 50%
circle_ on hover while lifting 1px; disabled at 0.35. Enter sends, Shift+Enter breaks; pasted or
picked images show in a 12px chip strip above. Focus-within mixes 30% foreground into the border
and doubles the shadow.

### Info panel (conversation details)

320px third pane (overlay below 1240px container width) on wash 0.02, left hairline, entering with
`social-info-in` (280ms, `translateX(14px)`). A sticky 30px round close X sits top-right (hover
inverts to ink). Hero: 76px avatar, name (0.98rem/750), @handle, about line, and a centered row of
hairline pills — Profile / Mute / Follow (following = solid ink with check). Groups swap in a large
dashed tile, member count, and Mute/Leave pills. Sections follow, each opened by an uppercase h3
micro-label above a 62%-opacity hairline: **Currently listening** (44px-art track card on wash 0.04
with equalizer or "PAUSED" label and a play button), **Shared tracks** (numbered rows: tabular
index, 40px art, title/subtitle, play), **Shared albums** (same rows, linked), **Mutuals &
groups** (overlapping 30px avatar stack — `-9px` margins, 2px card ring — plus count line and small
group rows), **Pinned** (pin-icon chip rows with unpin buttons; hint text when empty). Rows hover
on wash 0.05.

### Friendship gate

DMs require both people to follow each other. Until then, the thread is masked by an absolute
overlay: `color-mix(var(--card) 88%, transparent)` + `backdrop-filter: blur(6px)`, a grayscale 68px
avatar, state-specific copy, and a solid-ink Follow / Follow back pill when the current member still
needs to act. When they already follow the other member, the gate explains that it is waiting for a
follow-back and hides the redundant button. The composer hides while gated. New DM records, share
recipients, and group member choices all enforce the same mutual rule.

### Group identity and modal

Groups may carry an uploaded square picture. The image replaces the dashed group tile everywhere:
conversation rail, thread header, details panel, mutual group rows, and share recipients. The large
picture in details has a persistent image-plus edit affordance; any group member can replace it.

Fixed scrim `rgb(0 0 0 / 0.5)` fading in 180ms; 400px card using the opaque overlay recipe,
18px radius, `0 30px 90px` shadow, rising 240ms. Header + X, a name input (11px radius, wash 0.04,
focus border mix 30%), a picture picker with immediate local preview, a checkbox list of friends
(native checkboxes with `accent-color: var(--foreground)`), and a solid Create pill (disabled 0.4
until valid). Only mutual friends are listed.

### Lightbox

Fixed `rgb(0 0 0 / 0.82)` veil, 200ms opacity fade, zoom-out cursor; the image (14px radius, up to
1100px/88vh) floats on `0 40px 120px`; a 38px round close button with a white/25 hairline sits
top-right. Escape and backdrop clicks close.

### Share sheet

The global "Share" dialog (z-92, above pages, below lightbox). Scrim `rgb(0 0 0 / 0.55)` fades
220ms; the 460px card (max-height 86vh/720px) uses the opaque overlay recipe at 20px radius with
`0 34px 110px` shadow and enters from `translateY(14px) scale(0.985)` over 240ms
(`cubic-bezier(0.22,1,0.36,1)`); `body.share-sheet-open` locks scroll. Contents top-down: head +
X; either the **item preview** (52px art with disc fallback, uppercase type em, title, subtitle on
wash 0.04, 14px radius) or the **music picker** (search + "Now playing" + result rows reusing
recipient styling); for tracks, the **snippet toggle** — a hairline pill that fills solid when
armed, revealing the **cropper**: a 96px canvas waveform (DPR-aware, colors read live from
`--muted-foreground`/`--foreground`, `ew-resize` cursor) with draggable start/end handles (14px hit
zones, 3s minimum, 30s default), a loading veil ("Reading the song…"), and a transport row —
30px outline play disc (fills on hover/preview), tabular `0:00 – 0:30` range, length label, Reset
pill. Then the **recipients** list: search field, rows with 36px avatars (initial fallback), name +
handle, and a 20px check circle that fills ink with a check when selected (row wash 0.1); an
optional note input (11px radius, focus mix 30%); footer with a ghost **Copy link** pill and the
**Send** button (the morphing ink send button; label becomes "Send to N", disabled until a
recipient is chosen). Escape, scrim, and X close; focus returns to the opener.

### Profile social widgets

On member profiles: the **follow button** (`.btn-primary` + `.profile-follow-btn`) renders
ink-on-paper with user-plus/check + label; `is-following` swaps to `var(--secondary)` fill.
**Stats** read "N followers · M following" (0.74rem/600 muted). The **now-playing card** is a
14px-radius frame on wash 0.045 with equalizer bars, an uppercase "LISTENING NOW" / "PAUSED" em
(0.56rem/800, 0.11em), track title + artists, and an "Open" link.

## Do's and Don'ts

### Do:

- **Do** express every color through tokens (`var(--card)`, `var(--border)`,
  `rgb(var(--highlight-rgb), α)`, `color-mix(...)`) so all ten themes work — the fixed hexes
  `#5ee890`, `#ff5470` are the only exceptions, by contract.
- **Do** use the wash ladder for state: rest 0.02–0.045, hover 0.05–0.09, selected 0.09–0.12.
- **Do** keep motion at 240–320ms `cubic-bezier(0.22, 1, 0.36, 1)` with a single transformed
  property (6–14px translate or scale), and register every new animation/transition in the
  `prefers-reduced-motion` kill-list block.
- **Do** guard re-renders: `if (container.innerHTML !== html) container.innerHTML = html`.
- **Do** run all interpolated strings through `escapeHtml`, including attribute values.
- **Do** use the icon factories — `import I_X from '!lucide/x.svg?svg&icon'` then `I_X(size)` in
  JS-rendered markup; `<use svg="!lucide/x.svg" size="n">` in static index.html.
- **Do** use the opaque overlay recipe for any new floating card, and container queries for
  workspace-relative docking.
- **Do** add a scoped `[hidden] { display: none }` override when a new component renders inside a
  `span`-display rule (the legacy `span { display: inline-block }` beats the UA hidden stylesheet).
- **Do** cap unread counts at "99+" and debounce library searches (220–240ms).

### Don't:

- **Don't** introduce new hues. Presence green = alive, listening white = playing, like-red =
  liked. Everything else is the theme's neutrals.
- **Don't** put feed posts in cards — the feed is hairline-divided structure only.
- **Don't** shadow a resting inline surface; shadows are for the workspace shell, composers'
  focus state, hover-revealed tools, and floating overlays.
- **Don't** dock or reflow the messages workspace with media queries when the condition is really
  about the workspace's own width — use the container query.
- **Don't** add call UI (video/voice buttons) — mutes and messaging must not grow call features.
- **Don't** send messages without the optimistic path: temp `tmp-N` id, pending clock tick,
  replaced by the realtime/created record.
- **Don't** hardcode theme hexes from the default theme into new CSS; they will break the other
  nine themes.
- **Don't** let loops multiply: the only infinite animations are the presence pulse (2.4s) and the
  equalizer (0.75s alternate).
