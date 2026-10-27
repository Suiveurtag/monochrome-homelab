// js/social-booth.js — La Cabine: every member is a deck. The featured deck spins
// at its owner's real playback position over the track's own waveform; the shelf
// holds everyone else, receding with the age of their last listen. In Messages
// the same decks collapse into a strip (a view transition morphs between both).

import { escapeHtml } from './utils.js';
import { icon } from './social-icons.js';
import { rankBooth } from './social-state.js';
import { avatarFor, displayName, formatDuration, parseJson, presenceState, profileHref } from './social-utils.js';
import { coverColor, drawWave, patchKeyed, pulse, reducedMotion, trackPeaks } from './social-dom.js';

const SHELF_LIMIT = 11;
const COVER_ERROR = `onerror="if(this.crossOrigin){this.removeAttribute('crossorigin');this.src=this.src}else{this.hidden=true}"`;

// Full class names (not `is-${band}`) so PurgeCSS can see them. Your own deck never
// joins the silent edge: it keeps its invitation to share what you play.
function band(member) {
    if (member.depth <= 0.2) return 'is-near';
    if (member.depth < 1 || member.isMe) return 'is-far';
    return 'is-edge';
}

const isEdge = (member) => band(member) === 'is-edge';

export class SocialBooth {
    constructor(manager) {
        this.manager = manager;
        this.featuredUser = null;
        this.expanded = false;
        this.members = [];
        this.featured = null;
        this.metas = new Map();
        this.durations = new Map();
        this.timer = null;
        this.morphing = false;
        this.waveFor = '';
        this.peaks = null;
        this.bound = false;
    }

    get root() {
        return document.getElementById('social-booth');
    }

    /* --------------------------------- data ---------------------------------- */

    collect() {
        const m = this.manager;
        const members = [...m.profiles.values()].map((profile) => {
            const presence = m.presence.get(profile.user);
            const state = presenceState(presence);
            const track = parseJson(presence?.track);
            return {
                user: profile.user,
                profile,
                track: track?.id ? track : null,
                playing: state.playing,
                online: state.online,
                lastSeen: Date.parse(presence?.last_seen || presence?.updated || 0) || 0,
                position: Number(presence?.position) || 0,
                isMe: profile.user === m.userId,
            };
        });
        return rankBooth(members);
    }

    pickFeatured(ranked) {
        const pinned = ranked.find((member) => member.user === this.featuredUser && member.track);
        return (
            pinned ||
            ranked.find((member) => !member.isMe && member.track && member.depth < 1) ||
            ranked.find((member) => member.isMe && member.track && member.depth < 1) ||
            null
        );
    }

    meta(trackId) {
        if (!trackId) return Promise.resolve(null);
        if (!this.metas.has(trackId)) {
            const request = this.manager.api?.getTrackMetadata(trackId).catch(() => null) ?? Promise.resolve(null);
            this.metas.set(trackId, request);
        }
        return this.metas.get(trackId);
    }

    durationOf(member) {
        return this.durations.get(member?.track?.id) || 0;
    }

    positionOf(member) {
        if (!member) return 0;
        const elapsed = member.playing ? Math.max(0, (Date.now() - member.lastSeen) / 1000) : 0;
        const duration = this.durationOf(member);
        const position = member.position + elapsed;
        return duration ? Math.min(duration, position) : position;
    }

    /* -------------------------------- markup --------------------------------- */

    discHTML(member, { featured = false } = {}) {
        // Past the 30-day fade a member is only their avatar at the edge of the booth.
        const track = featured || member.depth < 1 ? member.track : null;
        const live = member.playing;
        const cover = track?.image
            ? `<img class="booth-cover" src="${escapeHtml(track.image)}" alt="" crossorigin="anonymous" data-deck-cover ${COVER_ERROR} />`
            : `<img class="booth-cover is-avatar" src="${escapeHtml(avatarFor(member.profile))}" alt="" loading="lazy" />`;
        const label = featured
            ? member.isMe
                ? 'Post what you are playing'
                : `${member.playing ? 'Listen along with' : 'Play what was playing for'} ${displayName(member.profile)}`
            : track
              ? `Feature ${displayName(member.profile)}'s deck`
              : `${displayName(member.profile)}'s profile`;
        const ring = track
            ? `<svg class="booth-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="booth-ring-track" cx="50" cy="50" r="48" pathLength="1"></circle><circle class="booth-ring-progress" cx="50" cy="50" r="48" pathLength="1"></circle></svg><span class="booth-marker" aria-hidden="true"></span>`
            : '';
        const tag = !featured && !track && !member.isMe ? 'a' : 'button';
        const attrs =
            tag === 'a'
                ? `href="${escapeHtml(profileHref(member.profile))}"`
                : `type="button" ${member.isMe && (featured || !track) ? 'data-deck-share' : featured ? `data-deck-listen="${escapeHtml(member.user)}"` : `data-deck-feature="${escapeHtml(member.user)}"`}`;
        const glow = track?.image && (live || featured) ? ' has-glow' : '';
        return `<${tag} class="booth-disc${live ? ' is-spinning' : ''}${glow}" ${attrs} data-deck-disc="${escapeHtml(member.user)}" aria-label="${escapeHtml(label)}">
            <span class="booth-platter">${cover}</span>${ring}${member.isMe && !track ? `<span class="booth-plus" aria-hidden="true">${icon.plus(18)}</span>` : ''}
        </${tag}>`;
    }

    stateLine(member) {
        if (member.playing) return 'Listening now';
        if (member.online) return member.track ? 'Paused' : 'Online';
        return member.lastSeen ? this.ago(member.lastSeen) : 'Never played';
    }

    ago(timestamp) {
        const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
        if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
        if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
        if (seconds < 604_800) return `${Math.round(seconds / 86_400)} d ago`;
        if (seconds < 2_592_000) return `${Math.round(seconds / 604_800)} wk ago`;
        return `${Math.round(seconds / 2_592_000)} mo ago`;
    }

    deckActions(member) {
        if (member.isMe) {
            return member.track
                ? `<button class="booth-icon-action" type="button" data-deck-share title="Post what you're playing" aria-label="Post what you're playing">${icon.share(15)}</button>`
                : '';
        }
        const friend = this.manager.canChatWith(member.user);
        const listen = member.track
            ? `<button class="booth-icon-action" type="button" data-deck-listen="${escapeHtml(member.user)}" title="${member.playing ? 'Listen along' : 'Play this'}" aria-label="${member.playing ? 'Listen along with' : 'Play what was playing for'} ${escapeHtml(displayName(member.profile))}">${icon.headphones(15)}</button>`
            : '';
        const talk = friend
            ? `<button class="booth-icon-action" type="button" data-deck-message="${escapeHtml(member.user)}" title="Message" aria-label="Message ${escapeHtml(displayName(member.profile))}">${icon.messageCircle(15)}</button>`
            : `<button class="booth-icon-action${this.manager.following.has(member.user) ? ' is-following' : ''}" type="button" data-deck-follow="${escapeHtml(member.user)}" aria-pressed="${this.manager.following.has(member.user)}" title="${this.manager.following.has(member.user) ? 'Following' : 'Follow'}" aria-label="${this.manager.following.has(member.user) ? 'Unfollow' : 'Follow'} ${escapeHtml(displayName(member.profile))}">${this.manager.following.has(member.user) ? icon.check(15) : icon.userPlus(15)}</button>`;
        return listen + talk;
    }

    deckHTML(member) {
        const track = member.track;
        const silent = !track || member.depth >= 1;
        const name = member.isMe ? 'You' : displayName(member.profile);
        const plate = member.isMe && silent
            ? `<span class="booth-name">You</span><span class="booth-line">${this.manager.player?.currentTrack ? "Share what you're playing" : 'Play something to share it'}</span>`
            : `<a class="booth-name" href="${escapeHtml(profileHref(member.profile))}">${member.playing ? '<i class="booth-live" aria-hidden="true"></i>' : ''}${escapeHtml(name)}</a>
               ${track ? `<span class="booth-track">${escapeHtml(track.title || '')}</span><span class="booth-line">${escapeHtml(track.subtitle || '')}</span>` : ''}
               <span class="booth-when"${member.playing ? ' data-deck-clock' : ''}>${escapeHtml(this.stateLine(member))}</span>`;
        return `<article class="booth-deck ${band(member)}${member.playing ? ' is-live' : ''}${member.isMe ? ' is-me' : ''}${silent ? ' is-silent' : ''}" data-user="${escapeHtml(member.user)}" style="--depth:${member.depth.toFixed(2)}">
            ${this.discHTML(member)}
            <div class="booth-plate">${plate}</div>
            <div class="booth-deck-actions">${this.deckActions(member)}</div>
        </article>`;
    }

    featureHTML(member) {
        if (!member) {
            const playing = this.manager.player?.currentTrack;
            return `<div class="booth-feature is-quiet">
                <div class="booth-quiet-platter" aria-hidden="true">${icon.disc(30)}</div>
                <div class="booth-readout">
                    <h2 class="booth-title">The room is quiet</h2>
                    <p class="booth-quiet-copy">Nobody has played anything lately. Start a record and your deck lights up for everyone here.</p>
                    ${playing ? `<div class="booth-actions"><button class="booth-primary" type="button" data-deck-share>${icon.share(16)}<span>Post what you're playing</span></button></div>` : ''}
                </div>
            </div>`;
        }
        const track = member.track;
        const name = member.isMe ? 'You' : displayName(member.profile);
        const friend = !member.isMe && this.manager.canChatWith(member.user);
        const following = this.manager.following.has(member.user);
        const mine = this.manager.player?.currentTrack;
        const alreadyAlong =
            !member.isMe && mine && String(mine.id) === String(track.id) && !this.manager.player?.activeElement?.paused;
        const primary = member.isMe
            ? `<button class="booth-primary" type="button" data-deck-share>${icon.share(16)}<span>Post what you're playing</span></button>`
            : `<button class="booth-primary${alreadyAlong ? ' is-along' : ''}" type="button" data-deck-listen="${escapeHtml(member.user)}">${alreadyAlong ? '<span class="booth-eq" aria-hidden="true"><i></i><i></i><i></i></span><span>Listening along</span>' : `${icon.headphones(16)}<span>${member.playing ? 'Listen along' : 'Play this'}</span>`}</button>`;
        const secondary = member.isMe
            ? ''
            : friend
              ? `<button class="booth-secondary" type="button" data-deck-message="${escapeHtml(member.user)}">${icon.messageCircle(16)}<span>Message</span></button>`
              : `<button class="booth-secondary${following ? ' is-following' : ''}" type="button" data-deck-follow="${escapeHtml(member.user)}" aria-pressed="${following}">${following ? icon.check(16) : icon.userPlus(16)}<span>${following ? 'Following' : 'Follow'}</span></button>`;
        return `<div class="booth-feature${member.playing ? ' is-live' : ''}" data-user="${escapeHtml(member.user)}">
            <div class="booth-deck is-featured${member.playing ? ' is-live' : ''}${member.isMe ? ' is-me' : ''}" data-user="${escapeHtml(member.user)}" style="--depth:0">
                ${this.discHTML(member, { featured: true })}
                <div class="booth-plate"><span class="booth-name">${escapeHtml(name)}</span></div>
            </div>
            <div class="booth-readout">
                <div class="booth-who">
                    <img src="${escapeHtml(avatarFor(member.profile))}" alt="" loading="lazy" />
                    ${member.isMe ? '<span>You</span>' : `<a href="${escapeHtml(profileHref(member.profile))}">${escapeHtml(name)}</a>`}
                    <span class="booth-state${member.playing ? ' is-live' : ''}">${escapeHtml(this.stateLine(member))}</span>
                </div>
                <a class="booth-title" href="${escapeHtml(track.href || `/track/${encodeURIComponent(track.id)}`)}">${escapeHtml(track.title || 'Untitled')}</a>
                <span class="booth-artist">${escapeHtml(track.subtitle || '')}</span>
                <div class="booth-wave is-loading" data-wave-seek="${escapeHtml(member.user)}" role="img" aria-label="Waveform of ${escapeHtml(track.title || 'this track')}">
                    <canvas></canvas><span class="booth-playhead" aria-hidden="true"></span>
                </div>
                <div class="booth-times"><span data-feature-position></span><span data-feature-duration></span></div>
                <div class="booth-actions">${primary}${secondary}</div>
            </div>
        </div>`;
    }

    /* -------------------------------- render --------------------------------- */

    render() {
        const root = this.root;
        if (!root) return;
        if (!this.manager.userId) {
            root.hidden = true;
            return;
        }
        root.hidden = false;
        this.bind();
        const ranked = this.collect();
        const featured = this.pickFeatured(ranked);
        if (this.featuredUser && featured?.user !== this.featuredUser) this.featuredUser = null;
        this.members = ranked;
        this.featured = featured;
        const shelf = ranked.filter((member) => member !== featured);
        const visible = this.expanded || root.classList.contains('is-strip') ? shelf : shelf.slice(0, SHELF_LIMIT);
        const rest = shelf.length - visible.length;

        const featureSlot = root.querySelector('[data-booth-feature]');
        const shelfSlot = root.querySelector('[data-booth-shelf]');
        const featureKey = featured ? `${featured.user}:${featured.track?.id}:${featured.playing}:${featured.online}` : 'quiet';
        patchKeyed(featureSlot, [{ key: featureKey, html: this.featureHTML(featured) }], { flip: false });
        const decks = visible.filter((member) => !isEdge(member));
        const edges = visible.filter(isEdge);
        patchKeyed(
            shelfSlot,
            [
                ...decks.map((member) => ({ key: member.user, html: this.deckHTML(member) })),
                ...(edges.length
                    ? [{ key: 'edge', html: '<div class="booth-edge" data-booth-edge></div>' }]
                    : []),
                ...(rest > 0
                    ? [
                          {
                              key: 'more',
                              html: `<button class="booth-more" type="button" data-booth-more aria-label="Show ${rest} more members">+${rest}</button>`,
                          },
                      ]
                    : []),
            ],
            { flip: !this.morphing, animateNew: true }
        );
        const edgeSlot = shelfSlot.querySelector('[data-booth-edge]');
        if (edgeSlot) {
            patchKeyed(
                edgeSlot,
                edges.map((member) => ({ key: member.user, html: this.deckHTML(member) })),
                { flip: !this.morphing, animateNew: true }
            );
            // Balanced rows: seven silent members sit as 4 + 3, never 6 + an orphan.
            const rows = Math.ceil(edges.length / 6);
            edgeSlot.style.setProperty('--edge-cols', String(Math.ceil(edges.length / rows)));
        }
        if (this.morphing) this.nameDiscs();
        this.fadeEdges();

        root.querySelectorAll('.booth-deck, .booth-feature').forEach((deck) => {
            coverColor(deck.querySelector('[data-deck-cover]'), (color) => deck.style.setProperty('--deck-color', color));
        });
        this.loadFeatureWave();
        this.tick();
        this.startTicker();
    }

    loadFeatureWave() {
        const featured = this.featured;
        const wave = this.root?.querySelector('.booth-wave');
        if (!featured?.track || !wave) return;
        const trackId = featured.track.id;
        this.meta(trackId).then((meta) => {
            if (meta?.duration) this.durations.set(trackId, Number(meta.duration));
            this.tick();
        });
        if (this.waveFor === trackId && this.peaks) {
            wave.classList.remove('is-loading');
            this.drawFeatureWave();
            return;
        }
        this.waveFor = trackId;
        this.peaks = null;
        trackPeaks(trackId, (id) => this.meta(id)).then((result) => {
            if (this.waveFor !== trackId) return;
            const current = this.root?.querySelector('.booth-wave');
            current?.classList.remove('is-loading');
            if (!result) {
                current?.classList.add('is-flat');
                return;
            }
            this.peaks = result.peaks;
            if (result.duration && !this.durations.has(trackId)) this.durations.set(trackId, result.duration);
            current?.classList.add('is-drawn');
            this.drawFeatureWave();
            this.tick();
        });
    }

    drawFeatureWave() {
        const wave = this.root?.querySelector('.booth-wave');
        const featured = this.featured;
        if (!wave || !this.peaks || !featured) return;
        const duration = this.durationOf(featured);
        const color = getComputedStyle(wave).getPropertyValue('--deck-color').trim() || '#f5f5f5';
        drawWave(wave.querySelector('canvas'), this.peaks, {
            color,
            progress: duration ? this.positionOf(featured) / duration : 0,
        });
    }

    /** One clock for every live readout: rings, markers, the playhead and the times. */
    tick() {
        const root = this.root;
        if (!root) return;
        root.querySelectorAll('.booth-deck').forEach((deck) => {
            const member = this.members.find((entry) => entry.user === deck.dataset.user);
            if (!member?.track) return;
            if (!this.durationOf(member)) {
                this.meta(member.track.id).then((meta) => {
                    if (meta?.duration && !this.durations.has(member.track.id)) {
                        this.durations.set(member.track.id, Number(meta.duration));
                        this.tick();
                    }
                });
                return;
            }
            deck.style.setProperty('--progress', (this.positionOf(member) / this.durationOf(member)).toFixed(4));
            const clock = deck.querySelector('[data-deck-clock]');
            if (clock) clock.textContent = `${formatDuration(this.positionOf(member))} / ${formatDuration(this.durationOf(member))}`;
        });
        const featured = this.featured;
        if (!featured?.track) return;
        const duration = this.durationOf(featured);
        const position = this.positionOf(featured);
        const feature = root.querySelector('.booth-feature');
        if (duration) feature?.style.setProperty('--progress', (position / duration).toFixed(4));
        const positionLabel = root.querySelector('[data-feature-position]');
        const durationLabel = root.querySelector('[data-feature-duration]');
        if (positionLabel) positionLabel.textContent = formatDuration(position);
        if (durationLabel && duration) durationLabel.textContent = formatDuration(duration);
        if (featured.playing) this.drawFeatureWave();
    }

    startTicker() {
        if (this.timer) return;
        this.timer = setInterval(() => {
            if (document.hidden || !document.getElementById('page-social')?.classList.contains('active')) return;
            if (!this.members.some((member) => member.playing)) return;
            this.tick();
        }, 1000);
    }

    /* ------------------------------- transitions ------------------------------ */

    nameDiscs() {
        this.root?.querySelectorAll('[data-deck-disc]').forEach((disc) => {
            disc.style.viewTransitionName = `deck-${disc.dataset.deckDisc}`;
        });
    }

    /** Run `update` inside a view transition so decks fly to their new places. */
    morph(update) {
        const root = this.root;
        if (!document.startViewTransition || reducedMotion() || !root || root.hidden || document.hidden) {
            update();
            return;
        }
        this.morphing = true;
        this.nameDiscs();
        const transition = document.startViewTransition(() => {
            update();
            this.nameDiscs();
        });
        void transition.finished.catch(() => {}).then(() => {
            this.morphing = false;
            this.root?.querySelectorAll('[data-deck-disc]').forEach((disc) => {
                disc.style.viewTransitionName = '';
            });
            this.drawFeatureWave();
        });
    }

    /** Scrolling rows fade out at the side that still hides decks, never at a hard edge. */
    fadeEdges() {
        const root = this.root;
        if (!root) return;
        const strip = root.classList.contains('is-strip');
        for (const row of [root, root.querySelector('[data-booth-shelf]')]) {
            if (!row) continue;
            const scrolls = (row === root) === strip && row.scrollWidth > row.clientWidth + 2;
            row.classList.toggle('is-overflowing', scrolls);
            row.style.setProperty('--fade-start', scrolls && row.scrollLeft > 4 ? '44px' : '0px');
            row.style.setProperty(
                '--fade-end',
                scrolls && row.scrollLeft + row.clientWidth < row.scrollWidth - 4 ? '56px' : '0px'
            );
        }
    }

    setStrip(strip) {
        const root = this.root;
        if (!root || root.classList.contains('is-strip') === strip) return false;
        root.classList.toggle('is-strip', strip);
        this.render();
        return true;
    }

    feature(userId) {
        if (!userId || this.featured?.user === userId) return;
        if (this.root?.classList.contains('is-strip')) {
            this.featuredUser = userId;
            this.manager.setTab('feed');
            return;
        }
        this.morph(() => {
            this.featuredUser = userId;
            this.render();
        });
    }

    /* --------------------------------- actions -------------------------------- */

    async listenAlong(userId, fraction = null) {
        const member = this.members.find((entry) => entry.user === userId);
        const trackId = member?.track?.id;
        if (!trackId) return;
        pulse(this.root?.querySelector(`.booth-deck[data-user="${CSS.escape(userId)}"]`), 'is-dropping');
        const meta = await this.meta(trackId);
        const duration = Number(meta?.duration) || this.durationOf(member);
        const start = fraction !== null && duration ? fraction * duration : member.playing ? this.positionOf(member) : 0;
        await this.manager.playTrackAt(trackId, start);
        setTimeout(() => this.render(), 700);
    }

    bind() {
        if (this.bound) return;
        const root = this.root;
        if (!root) return;
        this.bound = true;
        root.addEventListener('click', (event) => {
            const more = event.target.closest('[data-booth-more]');
            if (more) {
                this.expanded = true;
                this.render();
                return;
            }
            // In the Messages strip a deck is a door to the conversation.
            const stripDisc = root.classList.contains('is-strip') && event.target.closest('[data-deck-disc]');
            if (stripDisc) {
                const userId = stripDisc.dataset.deckDisc;
                if (userId !== this.manager.userId && this.manager.canChatWith(userId)) {
                    event.preventDefault();
                    this.manager.openConversationForUser(userId).catch(console.error);
                } else if (this.members.find((member) => member.user === userId)?.track) {
                    event.preventDefault();
                    this.feature(userId);
                }
                return; // A silent member's disc is a link to their profile.
            }
            const listen = event.target.closest('[data-deck-listen]');
            if (listen) {
                this.listenAlong(listen.dataset.deckListen).catch(console.error);
                return;
            }
            const message = event.target.closest('[data-deck-message]');
            if (message) {
                this.manager.openConversationForUser(message.dataset.deckMessage).catch(console.error);
                return;
            }
            const follow = event.target.closest('[data-deck-follow]');
            if (follow) {
                this.manager.toggleFollow(follow.dataset.deckFollow).catch(console.error);
                return;
            }
            if (event.target.closest('[data-deck-share]')) {
                this.manager.feed?.postNowPlaying();
                return;
            }
            const feature = event.target.closest('[data-deck-feature]');
            if (feature) {
                this.feature(feature.dataset.deckFeature);
                return;
            }
            const seek = event.target.closest('[data-wave-seek]');
            if (seek && !this.featured?.isMe) {
                const rect = seek.getBoundingClientRect();
                const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                this.listenAlong(seek.dataset.waveSeek, fraction).catch(console.error);
            }
        });
        root.addEventListener('pointermove', (event) => {
            const seek = event.target.closest('[data-wave-seek]');
            if (!seek) return;
            const rect = seek.getBoundingClientRect();
            seek.style.setProperty('--hover', ((event.clientX - rect.left) / rect.width).toFixed(4));
        });
        new ResizeObserver(() => {
            this.drawFeatureWave();
            this.fadeEdges();
        }).observe(root);
        root.addEventListener('scroll', () => this.fadeEdges(), { capture: true, passive: true });
        // A vertical wheel moves a row of decks sideways, the way the strip reads.
        root.addEventListener(
            'wheel',
            (event) => {
                const row = event.target.closest('.is-overflowing');
                if (!row || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
                row.scrollLeft += event.deltaY;
                event.preventDefault();
            },
            { passive: false }
        );
    }
}
