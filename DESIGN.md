---
name: Monochrome Social — La Cabine
description: The Social surface of the self-hosted Monochrome music club as a DJ booth — every member is a deck on matte black, color comes only from the artwork, presence green only for the living.
colors:
    ground: '#0a0a0a'
    ink: '#f5f5f5'
    card: '#141414'
    muted-ink: '#a0a0a0'
    border: '#2a2a2a'
    booth-panel: '#0f0f0f'
    booth-panel-deep: '#0c0c0c'
    booth-rule: 'color-mix(in srgb, #2a2a2a 72%, transparent)'
    booth-rule-soft: 'color-mix(in srgb, #2a2a2a 46%, transparent)'
    booth-wash: 'color-mix(in srgb, #f5f5f5 6%, transparent)'
    booth-wash-strong: 'color-mix(in srgb, #f5f5f5 11%, transparent)'
    bubble-other: '#1f1f1f'
    bubble-own: '#2f2f2f'
    booth-live: '#5ee890'
    booth-like: '#ff5470'
    initial-disc: '#2c2c2f'
    initial-letter: '#ececec'
typography:
    display:
        fontFamily: "Switzer, Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '2.1rem'
        fontWeight: 700
        lineHeight: 1
        letterSpacing: '-0.03em'
    deck-title:
        fontFamily: "Switzer, Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: 'clamp(1.7rem, 3.6cqi, 2.75rem)'
        fontWeight: 700
        lineHeight: 1.02
        letterSpacing: '-0.03em'
    headline:
        fontFamily: "Switzer, Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '1.2rem'
        fontWeight: 700
        lineHeight: 1.2
        letterSpacing: '-0.01em'
    title:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '1rem'
        fontWeight: 700
        lineHeight: 1.25
        letterSpacing: 'normal'
    name:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.88rem'
        fontWeight: 650
        lineHeight: 1.3
        letterSpacing: 'normal'
    body:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.97rem'
        fontWeight: 400
        lineHeight: 1.5
        letterSpacing: 'normal'
    message:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.95rem'
        fontWeight: 400
        lineHeight: 1.45
        letterSpacing: 'normal'
    meta:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.78rem'
        fontWeight: 400
        lineHeight: 1.3
        letterSpacing: 'normal'
        fontFeature: '"tnum"'
    readout:
        fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif"
        fontSize: '0.8rem'
        fontWeight: 600
        lineHeight: 1.3
        letterSpacing: '0.02em'
        fontFeature: '"tnum"'
rounded:
    disc: '50%'
    pill: '999px'
    panel: '16px'
    snippet: '14px'
    bubble: '14px'
    strip: '12px'
    modal: '18px'
    art: '7px'
    cue: '2px'
spacing:
    ply: '0.75rem'
    panel: '1.25rem'
    feature: 'clamp(1.75rem, 3.4cqi, 2.6rem)'
    row: '0.8rem 0.95rem'
    action: '0.4rem'
    plate: '0.55rem'
components:
    booth-panel:
        backgroundColor: '{colors.booth-panel-deep}'
        rounded: '{rounded.panel}'
        padding: '{spacing.panel}'
    deck-featured:
        rounded: '{rounded.disc}'
        size: 'clamp(150px, 19cqi, 236px)'
    deck-near:
        rounded: '{rounded.disc}'
        size: '100px'
    deck-far:
        rounded: '{rounded.disc}'
        size: 'calc(90px - var(--depth) * 32px)'
    deck-edge:
        rounded: '{rounded.disc}'
        size: '52px'
    deck-strip:
        rounded: '{rounded.disc}'
        size: '60px'
    button-listen:
        backgroundColor: '{colors.ink}'
        textColor: '{colors.ground}'
        rounded: '{rounded.pill}'
        height: '42px'
        padding: '0 1.15rem'
    button-deck-secondary:
        backgroundColor: 'color-mix(in srgb, #0a0a0a 60%, transparent)'
        textColor: '{colors.ink}'
        rounded: '{rounded.pill}'
        height: '42px'
        padding: '0 1.15rem'
    button-deck-secondary-hover:
        backgroundColor: '{colors.booth-wash-strong}'
    deck-icon-action:
        backgroundColor: '{colors.booth-panel}'
        textColor: '{colors.ink}'
        rounded: '{rounded.disc}'
        size: '32px'
    deck-icon-action-hover:
        backgroundColor: '{colors.ink}'
        textColor: '{colors.ground}'
    social-tab:
        backgroundColor: 'transparent'
        textColor: '{colors.muted-ink}'
        padding: '0.4rem 0 0.75rem'
    social-tab-active:
        textColor: '{colors.ink}'
    music-strip:
        backgroundColor: '{colors.booth-panel-deep}'
        textColor: '{colors.ink}'
        rounded: '{rounded.strip}'
        padding: '0.5rem 1rem 0.5rem 0.5rem'
    post-composer:
        backgroundColor: '{colors.booth-panel}'
        rounded: '{rounded.panel}'
        padding: '0.65rem 0.7rem'
    post-action:
        backgroundColor: 'transparent'
        textColor: '{colors.muted-ink}'
        rounded: '{rounded.pill}'
        height: '34px'
        padding: '0 0.6rem'
    post-action-hover:
        backgroundColor: '{colors.booth-wash-strong}'
        textColor: '{colors.ink}'
    chat-row:
        backgroundColor: 'transparent'
        textColor: '{colors.ink}'
        padding: '{spacing.row}'
    chat-row-active:
        backgroundColor: '{colors.booth-wash}'
    message-bubble-other:
        backgroundColor: '{colors.bubble-other}'
        textColor: '{colors.ink}'
        rounded: '{rounded.bubble}'
        padding: '0.6rem 0.9rem'
    message-bubble-own:
        backgroundColor: '{colors.bubble-own}'
        textColor: '{colors.ink}'
        rounded: '{rounded.bubble}'
        padding: '0.6rem 0.9rem'
    snippet-deck:
        backgroundColor: '{colors.booth-panel-deep}'
        rounded: '{rounded.snippet}'
        padding: '0.85rem 1rem 0.85rem 0.85rem'
    message-composer:
        backgroundColor: '{colors.booth-panel}'
        rounded: '{rounded.panel}'
        padding: '0.35rem 0.35rem 0.35rem 0.45rem'
    group-modal-card:
        backgroundColor: '{colors.ground}'
        textColor: '{colors.ink}'
        rounded: '{rounded.modal}'
        padding: '{spacing.panel}'
        width: 'min(420px, 100%)'
---

# Design System: Monochrome Social

> **Boundary.** This file documents ONLY the Social surface: `#page-social` (header, booth, Feed
> view, Messages view, details panel, friendship gate) and its body-level group modal and lightbox,
> all styled by `social.css`; plus the Admin and Listening Stats addenda below. The global share
> sheet and the social widgets on member profiles are outside this redesign and keep their existing
> styles in `styles.css`. Everything else in the app (player, library, sidebar, Now Playing panel)
> is undocumented here. Hex values below are the `monochrome` default theme; the build expresses
> every neutral through theme tokens (`--background`, `--foreground`, `--card`, `--border`,
> `--muted-foreground`, `--ring`, `--font-family`, `--font-family-key`) so all ten themes render,
> including the light `white` theme.

## Overview

**Creative North Star: "La Cabine"**

Social is a DJ booth, not a chat app or a card feed. Every member is a deck: their current or last
cover spins on a dark platter inside a progress ring, with their name plate, state line and dated
last listen beside it. The page opens on who is playing what: a featured deck with the track's real
waveform and a live playhead, a shelf of other decks receding by recency, then the composer and the
track log. Messages collapses the booth into a strip of discs and keeps the messenger fundamentals
(list, thread, docked composer, details panel).

The material is matte black and deliberately colorless. The surface has no hue of its own: chroma
comes only from the artwork, read from each cover at runtime and spilled as symmetric light, ring
color, waveform gradient and conversation tint. Exactly two fixed hues exist, each with one meaning:
presence green for someone here now, like-red for a liked post. Depth is three plies only: the page
ground, inset panels, floating overlays.

Motion is the room being alive, never decoration: platters spin at 7.2s per turn only while their
member plays, rings and playheads advance on real time, layout moves on one ease-out curve, and a
springy overshoot is reserved for tactile gestures. Everything is off under reduced motion.

**Key Characteristics:**

- Members rendered as decks: cover disc, progress ring, rim marker, name plate, state line, dated last listen
- Featured deck and shelf side by side at 1.38fr : 1fr (about 58/42), stacking below a 1060px container
- Recency as depth: older listens shrink, desaturate and dim; silent members sit at an avatar-only edge
- Artwork is the only source of color; it never marks state
- Real waveforms decoded from the audio, tinted by the cover, readable on dark covers
- Three plies: ground, 16px inset panels on hairlines, opaque floating overlays
- Container queries on `#page-social`, never viewport media queries, for layout
- Keyed DOM patching so live updates never restart a spinning deck or replay an entrance
- Chrome hidden until hover or focus on decks and messages; states stamp, strikes draw

## Colors

Matte black ink-on-ink with artwork as the only light source; two reserved signal hues.

### Primary

- **Booth Ink** (`{colors.ink}`, `var(--foreground)`): the action color. Solid fill of the Listen
  along / Play this button, the hover state of deck icon actions, the tab underline, the waveform
  playhead and rim marker, the read double-check, snippet cue brackets, the pinned-message button.
  Text on ink is always the ground.

### Secondary

- **Artwork Color** (runtime, `--deck-color` on decks, `--tint` on strips, snippets and info decks):
  the cover's vibrant color via `getVibrantColorFromImage`, cached per image URL (96 entries). It
  paints the progress ring, the symmetric glow behind a disc, the waveform gradient (cover hue to a
  neighbouring hue +0.09, lifted 0.12), strip and snippet radial washes, and the blurred cover tint
  behind conversation rows and threads. Falls back to ink when unreadable.

### Tertiary

- **Presence Green** (`{colors.booth-live}`): someone is here now. The header pulse dot (2.4s ping),
  the live dot before a playing member's state line (7px with an 18% halo), and online/listening
  avatar dots in Messages.
- **Like Red** (`{colors.booth-like}`): the liked heart, its fill, and the burst ring. Nothing else.

### Neutral

- **Ground** (`{colors.ground}`, `var(--background)`): the page ply and text on ink fills.
- **Booth Panel** (`{colors.booth-panel}`, card 46% into ground): composers and feed streams.
- **Booth Panel Deep** (`{colors.booth-panel-deep}`, card 22% into ground): booth slots, Messages
  panes, music strips, snippets, the docked details panel.
- **Rules** (`{colors.booth-rule}` / `{colors.booth-rule-soft}`, border at 72% / 46%): action and
  dashed outlines / every panel edge and row divider.
- **Washes** (`{colors.booth-wash}` / `{colors.booth-wash-strong}`, ink at 6% / 11%): selected and
  hover fills. Rows hover at 2-3% ink, the active conversation sits at 6%.
- **Bubbles** (`{colors.bubble-other}` / `{colors.bubble-own}`): ink at 8% / 15% into the deep panel.
- **Muted Ink** (`{colors.muted-ink}`): state lines, dates, handles, idle icons, inactive tabs.
- **Initial Disc** (`{colors.initial-disc}` with `{colors.initial-letter}`): the neutral disc for a
  member without a picture, its initial painted in the app font at 600 weight.

### Named Rules

**The Artwork-Only Chroma Rule.** The surface owns no hue. Every chromatic pixel outside the two
signal colors is read from a cover; never pick a decorative accent.

**The Cover-Never-Marks-State Rule.** A cover's color says what is playing, never whether someone is
live, unread, selected or followed. State is ink, wash, or presence green.

**The One Meaning Rule.** Presence green means a human is here now; like-red means liked. Neither
appears anywhere else, and no other hue may carry a state.

## Typography

**Display Font:** Switzer (via `var(--font-family-key)`, falling back to Inter)
**Body Font:** Inter (via `var(--font-family)`, with Noto Sans per-script fallbacks and system-ui)

**Character:** Switzer is the deck's label voice, used only for the big readouts; Inter carries all
UI at small, confident weights. Hierarchy comes from size and weight (550-700), not case: the
shipped surface has no uppercase labels.

### Hierarchy

- **Display** (Switzer 700, 2.1rem, 1, -0.03em): the "Social" title.
- **Deck Title** (Switzer 700, `clamp(1.7rem, 3.6cqi, 2.75rem)`, 1.02, -0.03em, two-line clamp,
  balanced): the featured track title. Artist sits under it at 1.12rem/500 muted.
- **Headline** (Switzer 700, 1.2-1.25rem): empty-state headings, details hero name, group modal title.
- **Title** (Inter 700, 0.98-1rem): stream titles ("Your circle", "Across Monochrome"), thread name.
- **Name** (Inter 650, 0.84-0.94rem): name plates, post authors, chat names, message authors.
- **Body** (Inter 400, 0.97rem, 1.5): post text, pre-wrapped. Messages at 0.95rem/1.45; comments
  0.88rem/1.45.
- **Meta** (Inter 400-600, 0.72-0.82rem, tabular figures): state lines, dated last listens, post
  gutter times, message clocks, counts.
- **Readout** (Inter 600, 0.8rem, 0.02em, tabular figures): waveform times `0:00 / 6:12`.

### Named Rules

**The Tabular Readout Rule.** Every number that reads as time, position or count uses
`font-variant-numeric: tabular-nums`, so live readouts never jitter.

**The Switzer Is a Label Rule.** Switzer appears only at headline sizes and above; it never sets
body, names or controls.

## Layout

`#page-social` is capped at 1380px, centered, and is a named size container
(`container: social / inline-size`). The Now Playing panel and sidebar make viewport width a lie, so
every layout change is a container query on `social`.

- **Booth (Feed):** a two-column grid `minmax(0, 1.38fr) minmax(0, 1fr)` with a 0.75rem gap: the
  featured slot (disc + readout) and the shelf. The featured slot pads by
  `clamp(1.75rem, 3.4cqi, 2.6rem)`, at least 18% of the disc, so its light never meets the edge.
- **Shelf:** near and far decks pair up two per row with their plates; below them the silent edge
  is a balanced grid of avatar discs whose column count (`--edge-cols`) the script computes as
  `ceil(count / rows)`. A dashed `+N` pill caps overflow.
- **Depth ladder** (`boothDepth` / `rankBooth`): playing = 0, online with a track = 0.18, otherwise
  log-scaled by age from 0.3 to 0.92 across 30 days; older than 30 days, or never listened = 1, the
  edge. Order is depth, then most recent. Bands: depth <= 0.2 near (100px disc), < 1 far
  (`90px - depth * 32px`), else edge (52px). Your own deck never joins the edge: a silent "You"
  stays a far deck with a dashed platter and a plus to share what you play. Disc filter follows
  depth: `saturate(1 - depth*0.8) brightness(1 - depth*0.32)`, cleared on hover.
- **Feed below the booth:** the composer, then streams as inset panels. Each post is a timeline row:
  76px time gutter, a 1px rule with one 6px stop per post, 40px avatar, content. Actions float
  top-right so text wraps beside them and strips run the full column.
- **Messages:** the booth collapses to a single scrolling strip of 60px discs (88px slots). Below
  it, a grid `300px minmax(0, 1fr)` gaining a `320px` details column with `.has-info`, height
  `clamp(440px, calc(100dvh - 416px), 980px)`.
- **Container breakpoints:** 1240px docks the details panel as an overlay (`min(340px, 88%)`); 1060px
  stacks the booth and turns the shelf into one horizontal scrolling row (128px deck slots, 72px edge
  slots); 820px narrows the list to 250px, the post gutter to 58px, and wraps strips onto two rows;
  640px drops the timeline gutter, shrinks the featured disc to 132px, and shows one Messages pane at
  a time with a back button.
- **Rhythm:** 0.75rem between plies, 1.25rem panel padding, 0.4-0.55rem inside plates and action
  groups, 0.8rem 0.95rem chat rows.

### Named Rules

**The Container Knows Rule.** Layout responds to `@container social`, never a viewport media query.

**The Recency-Is-Depth Rule.** Distance in the booth is time since the last listen, on the
`boothDepth` ladder. Never size or fade a deck for any other reason.

**The Clip-Not-Hide Rule.** Panes, slots, strips and rows use `overflow: clip`, never `hidden`, so
focusing a field can never scroll a pane sideways. Rows that scroll (shelf, strip) fade only on the
side that still hides decks (`--fade-start` / `--fade-end`).

## Elevation & Depth

Three plies and nothing between them. The ground is flat. Inset panels sit on it with a 1px
soft rule and a 16px radius, without shadow. Floating overlays use the opaque recipe
(`background-color: var(--background)` plus a `linear-gradient` of a panel mix) and large soft
shadows. Inside panels, depth is light, not lift: covers glow and discs carry their own platter
shadow because they are physical records.

### Shadow Vocabulary

- **Platter** (`0 0 0 1px` ink 8%, `0 14px 34px rgb(0 0 0 / 0.42)`): every deck disc's record.
- **Listen lift** (`0 8px 20px rgb(0 0 0 / 0.32)`): the ink Listen along button on hover, with a 2px rise.
- **Composer focus** (`0 18px 50px rgb(0 0 0 / 0.22)` feed, `0 14px 40px rgb(0 0 0 / 0.25)` messages):
  only on `:focus-within`, with the border mixing 22-24% ink.
- **Docked details** (`-24px 0 60px rgb(0 0 0 / 0.3)`): the details panel as an overlay below 1240px.
- **Group modal** (`0 30px 90px rgb(0 0 0 / 0.45)`, scrim `rgb(0 0 0 / 0.55)`, z 90) and **lightbox
  image** (`0 40px 120px rgb(0 0 0 / 0.5)`, veil `rgb(0 0 0 / 0.84)`, z 95).
- **Artwork light** (not a shadow): the disc glow, a radial at `inset: -18%` from 46% to 18% cover
  color, symmetric, faded to 70% on the shelf and removed in the strip; the rim marker
  (`0 0 10px`) and playhead (`0 0 12px`) glow in cover color.

### Named Rules

**The Three Plies Rule.** Ground, inset panel, floating overlay. Never nest a panel in a panel to
make a fourth ply; group with rules and spacing instead.

**The Symmetric Light Rule.** Cover light is a centered radial around the disc and fades before the
panel edge. No directional or offset glows.

## Shapes

Records are circles; containers are softly rounded; actions are pills.

- **Circles (50%):** deck discs, platters, avatars, presence dots, deck icon actions, snippet discs,
  the dashed quiet and empty marks. Records carry a spindle hole; avatar platters do not.
- **Pills (999px):** Listen along and its secondary, post actions, unread count, `+N`.
- **Panels (16px):** booth slots, strip, composers, feed streams, Messages panes.
- **Snippets and bubbles (14px):** snippet decks, message bubbles, lightbox image.
- **Strips (12px):** music strips in posts; artwork inside them at 7px.
- **Modal (18px):** the group modal card.
- **Rings and cues:** 2.6px progress ring strokes with round caps; snippet ranges framed by square
  2px ink brackets; the tab underline a 2px bar.
- **Dashed outlines** (1.5px) mark absence: your silent deck, the quiet room, empty states, `+N`.

## Components

### Header

The "Social" display title with a presence summary on its baseline (pulsing green dot, then a
tabular count such as "2 online"). Feed / Messages are line tabs: 1rem/600 muted labels, ink when
selected, with a 2px ink thumb that slides 420ms under the active tab and is the one header element
named for view transitions. The unread count is an 11% wash pill.

### Deck (signature)

- **Anatomy:** a disc button holding a platter (cover, inset 8%, spindle hole and sheen), an SVG
  progress ring (9% ink track, cover-colored progress), and a rim marker rotated to the progress.
- **States:** spinning only while playing (`booth-spin` 7.2s linear); markers dim to 55% on decks
  neither live nor featured; avatars at `grayscale(0.6)`; hover lifts 3px and scales 1.035, clears
  the depth filter; active presses to 0.97.
- **Plate (fixed furniture):** name (0.88rem/650, links to profile), track (0.84rem/550), and a
  state line or dated last listen (0.78rem muted, tabular). Live members lead with the green dot.
- **Actions:** 32px circular icon actions (Listen along, Message or Follow) float over the plate's
  end and appear only on hover or focus-within; hover inverts to ink and scales 1.08.
- **Featured readout:** who (24px avatar + name + state), deck title, artist, a 62px waveform with
  ink playhead and hover cue line, tabular times, then Listen along (ink) and Message / Follow
  (outlined). Clicking a shelf deck promotes it. Listen along joins at the friend's extrapolated
  position; the joined deck needle-drops (620ms spring dip, ring flash).
- **Quiet room:** a dashed 120-176px platter and a 42ch muted line when nobody has a track.

### Booth strip (Messages)

The same deck markup in a compact state: 60px discs with centered 0.76rem names, no readout,
actions or glow; non-live names muted, live ones keep a 6px green dot. Switching tabs morphs each
disc between hero and strip through view transitions (560ms, ease-out curve).

### Music strip and waveform

A strip per shared track or album: 60px art, title/subtitle, a 38px play control, the track's real
waveform, and its length. Background is a radial wash of the cover over the deep panel; hover tints
the border 34% cover and zooms the art 1.06. Hovering the waveform shows a small ink "Play from here"
tag; the waveform draws in left to right (800-900ms clip). Loading shows a scanning cover-colored
line; tracks without peaks show a flat 2px line.

**Waveform drawing:** mirrored bars (2px with 1.6px gaps, 1.5/1.2px under 420px) on a DPR-aware
canvas; peaks are decoded once per track and cached in `localStorage`
(`monochrome-social-peaks:<id>`). Levels stretch the track's own dynamic range (8th percentile to
max, 0.12 floor, exponent 1.4); bar color is the cover lifted to at least 0.56 lightness so dark
covers stay legible; played bars at full alpha, unplayed at 0.5, out of a snippet range at 0.28.

### Feed post and composer

- **Composer:** 44px avatar, an autosizing field, track and image tools, the Post action; a 16px
  panel that gains the focus shadow. Sharing from your deck summons it with a 3px ink ring pulse.
- **Post:** time gutter (time at 600, date muted), author 0.94rem, handle, body; heart, comment and
  share pills (0.84rem/600 tabular counts) float top-right, muted at rest, ink on 11% wash on hover.
  Liking turns the heart like-red and filled, pops it (520ms spring) with a ring burst and a count
  tick. Comments unfold under the post.

### Conversation list

Rows of 44px avatar + name, date and preview, separated by soft rules. The conversation wears the
cover of the last music shared in it, else the contact's current track: a blurred, saturated cover
masked in from the right at 0.2 opacity, 0.3 on hover, 0.5 when active. The active row also carries
a 6% ink wash and a sliding indicator. Playing members wear a thin spinning conic groove around
their avatar; presence dots are 12px with a ground ring (muted offline, green online or listening).
New rows slide in 12px.

### Thread and messages

The thread wears a blurred cover tint in its top corner (0.3 opacity, fading in 1.2s). Day spacers
are muted 0.76rem/600 labels between soft rules. Bubbles are uniform 14px with no border or shadow:
others at 8% ink, own at 15%. The foot holds a tabular clock and delivery ticks: clock at 0.6 =
pending, double-check muted = delivered, double-check ink = read; a tick change stamps onto the
bubble (460ms spring). Arrivals spring in from the left, sends rise from below. A pin waits beside
each bubble, revealed on hover; pinning drops it in (520ms spring) and leaves it ink-filled.

### Snippet deck

A shared excerpt arrives as a mini deck: a 76px disc with a 2px cover ring whose platter spins only
while the excerpt plays, title/subtitle, a play control, and a 52px waveform from stored peaks with
the range framed by square ink brackets and a tabular range label beneath.

### Message composer

A slim 16px panel docked under the thread: image and track tools, an autosizing field, and the send
control. `:focus-within` mixes 24% ink into the border and adds the composer focus shadow.

### Details panel and friendship gate

The details panel is a third pane (overlay below 1240px) using the opaque recipe over the deep
panel, entering 380ms from 18px right and leaving in 240ms. The hero name is Switzer 1.25rem;
sections open with 0.86rem/650 sentence-case headings; the current listen is an info deck in cover
tint. Follow, unfollow and block land as a rubber stamp (480ms spring, from 1.5x and -10deg); blocking
draws a 2px strike across the hero and grays the avatar. The friendship gate veils a thread with an
82% ground blur(8px), a grayscale avatar ringed by a 6px wash, and an ink Follow pill.

### Group modal and lightbox

Body-level overlays. The modal card is `min(420px, 100%)`, opaque recipe with card 40% into ground,
18px radius, rising 380ms from 16px and 0.98 scale over a 200ms scrim. The lightbox fades its veil in
220ms and scales the image from 0.96.

### Motion grammar

- **Layout and hover:** `--booth-ease` `cubic-bezier(0.22, 1, 0.36, 1)`, 200-640ms, one property per move.
- **Gestures:** `--booth-spring` `cubic-bezier(0.34, 1.45, 0.64, 1)`, only on keyframe gestures the
  user performs or receives: like, send, message arrival, tick and follow stamps, pin drop, deck drop,
  deck arrival, chip and arm feedback.
- **Real time:** rings, markers and playheads advance linearly over 1s; platters spin linearly.
- **View transitions:** only discs are named (`deck-<id>`) and only for the tab morph; views are not
  named because their snapshots escape the scrolling column and paint over the player. Views enter
  with their own 460ms 28px slide, reversed when going back.
- **Keyed patching:** lists are patched by key with FLIP, so live re-renders never restart a spinning
  platter or replay an entrance; only genuinely new decks, rows and messages animate in.
- **Reduced motion:** every animation and transition under `#page-social`, the modal and the
  lightbox, plus all view-transition pseudo-elements, is disabled.

## Do's and Don'ts

### Do:

- **Do** express every neutral through theme tokens or the `--booth-*` mixes; `#5ee890` and `#ff5470` are the only fixed hues.
- **Do** read color from the artwork into `--deck-color` or `--tint`, and fall back to ink.
- **Do** place every member on the `boothDepth` ladder and keep their fixed furniture: name plate, state line, dated last listen.
- **Do** draw waveforms from real decoded peaks, cached once per track, with the dynamic-range stretch and the 0.56 lightness floor.
- **Do** use `@container social` for every layout change, and `overflow: clip` on panes and rows.
- **Do** keep the spring for tactile keyframe gestures and the ease-out curve for everything else, and register new motion in the reduced-motion block.
- **Do** patch lists by key so a spinning deck never restarts.
- **Do** write class names as literals in JS (`'is-near'`, never `` `is-${band}` ``) so PurgeCSS keeps them.
- **Do** use `tabular-nums` on every time, position and count.

### Don't:

- **Don't** let a cover color mark state (live, unread, selected, followed).
- **Don't** use presence green for anything but presence, or like-red for anything but likes.
- **Don't** add a fourth ply: no panel inside a panel, no shadow on a resting inset panel.
- **Don't** cast directional or offset glows; cover light is symmetric and stops before the panel edge.
- **Don't** fake waveforms with random or placeholder bars.
- **Don't** put a spindle through an avatar, or send a member to the edge unless they have no listen within 30 days (never "You").
- **Don't** name whole views for view transitions.
- **Don't** show deck actions or the message pin at rest; they appear on hover or focus.

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
