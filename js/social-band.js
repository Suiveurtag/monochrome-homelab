// js/social-band.js — the listening band at the head of the Social feed. One credit per
// member who played something in the last 30 days: their face on the record's square sleeve,
// their name, the track, and when. Live members lead, with a hairline that follows their
// real playback position; members who have been quiet gather as faces at the end.

import { escapeHtml } from './utils.js';
import { icon } from './social-icons.js';
import { rankBooth } from './social-state.js';
import { avatarFor, displayName, parseJson, presenceState, profileHref } from './social-utils.js';
import { coverColor, patchKeyed, pulse } from './social-dom.js';

const QUIET_FACES = 5;
const COVER_ERROR = `onerror="if(this.crossOrigin){this.removeAttribute('crossorigin');this.src=this.src}else{this.hidden=true}"`;

export class SocialBand {
    constructor(manager) {
        this.manager = manager;
        this.members = [];
        this.metas = new Map();
        this.durations = new Map();
        this.timer = null;
        this.bound = false;
    }

    get root() {
        return document.getElementById('social-band');
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

    /** Where a friend is in their track now, extrapolated from their last heartbeat. */
    positionOf(member) {
        if (!member) return 0;
        const elapsed = member.playing ? Math.max(0, (Date.now() - member.lastSeen) / 1000) : 0;
        const duration = this.durationOf(member);
        const position = member.position + elapsed;
        return duration ? Math.min(duration, position) : position;
    }

    ago(timestamp) {
        const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
        if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
        if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
        if (seconds < 604_800) return `${Math.round(seconds / 86_400)} d ago`;
        if (seconds < 2_592_000) return `${Math.round(seconds / 604_800)} wk ago`;
        return `${Math.round(seconds / 2_592_000)} mo ago`;
    }

    stateLine(member) {
        if (member.playing) return 'Listening now';
        if (member.online) return member.track ? 'Paused' : 'Online';
        return member.lastSeen ? this.ago(member.lastSeen) : 'Nothing played yet';
    }

    isAlong(member) {
        const mine = this.manager.player?.currentTrack;
        return Boolean(
            !member.isMe &&
                member.track &&
                mine &&
                String(mine.id) === String(member.track.id) &&
                !this.manager.player?.activeElement?.paused
        );
    }

    /* -------------------------------- markup --------------------------------- */

    creditHTML(member) {
        const track = member.track;
        const name = member.isMe ? 'You' : displayName(member.profile);
        const along = this.isAlong(member);
        const face = `<img class="social-credit-face" src="${escapeHtml(avatarFor(member.profile))}" alt="" loading="lazy" />`;

        if (member.isMe && !track) {
            const canShare = Boolean(this.manager.player?.currentTrack);
            return `<article class="social-credit is-me is-blank" data-user="${escapeHtml(member.user)}">
                <button class="social-credit-art" type="button" data-band-share aria-label="${canShare ? "Post what you're playing" : 'Write a post'}">
                    <span class="social-credit-sleeve is-blank" aria-hidden="true">${icon.plus(18)}</span>${face}
                </button>
                <div class="social-credit-copy">
                    <span class="social-credit-name">You</span>
                    <span class="social-credit-track">${canShare ? "Share what you're playing" : 'Play something to share it'}</span>
                </div>
            </article>`;
        }

        const sleeve = track.image
            ? `<img src="${escapeHtml(track.image)}" alt="" crossorigin="anonymous" data-band-cover ${COVER_ERROR} />`
            : icon.music(18);
        const cueLabel = member.isMe
            ? "Post what you're playing"
            : along
              ? `Listening along with ${name}`
              : `${member.playing ? 'Listen along with' : 'Play what was playing for'} ${name}`;
        const cue = member.isMe ? icon.share(16) : along ? '<span class="social-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : icon.headphones(17);
        const art = `<button class="social-credit-art" type="button" ${member.isMe ? 'data-band-share' : `data-band-listen="${escapeHtml(member.user)}"`} aria-label="${escapeHtml(cueLabel)}" title="${escapeHtml(cueLabel)}">
                <span class="social-credit-sleeve">${sleeve}</span>${face}
                <span class="social-credit-cue" aria-hidden="true">${cue}</span>
            </button>`;
        const nameHTML = member.isMe
            ? '<span class="social-credit-name">You</span>'
            : `<a class="social-credit-name" href="${escapeHtml(profileHref(member.profile))}">${escapeHtml(name)}</a>`;
        const actions = member.isMe ? '' : `<div class="social-credit-actions">${this.creditActions(member)}</div>`;
        return `<article class="social-credit${member.playing ? ' is-live' : ''}${member.isMe ? ' is-me' : ''}${along ? ' is-along' : ''}" data-user="${escapeHtml(member.user)}" data-tint-target>
            ${art}
            <div class="social-credit-copy">
                ${nameHTML}
                <span class="social-credit-track" title="${escapeHtml([track.title, track.subtitle].filter(Boolean).join(', '))}">${escapeHtml(track.title || 'Untitled')}</span>
                <span class="social-credit-when">${member.playing ? '<i class="social-live-dot" aria-hidden="true"></i>' : ''}${escapeHtml(along ? 'Listening along' : this.stateLine(member))}</span>
            </div>
            ${member.playing ? '<span class="social-credit-groove" aria-hidden="true"><i></i></span>' : ''}
            ${actions}
        </article>`;
    }

    creditActions(member) {
        const name = escapeHtml(displayName(member.profile));
        if (this.manager.canChatWith(member.user)) {
            return `<button class="social-credit-action" type="button" data-band-message="${escapeHtml(member.user)}" title="Message" aria-label="Message ${name}">${icon.messageCircle(15)}</button>`;
        }
        const following = this.manager.following.has(member.user);
        return `<button class="social-credit-action${following ? ' is-following' : ''}" type="button" data-band-follow="${escapeHtml(member.user)}" aria-pressed="${following}" title="${following ? 'Following' : 'Follow'}" aria-label="${following ? 'Unfollow' : 'Follow'} ${name}">${following ? icon.check(15) : icon.userPlus(15)}</button>`;
    }

    quietHTML(quiet) {
        const faces = quiet
            .slice(0, QUIET_FACES)
            .map(
                (member) =>
                    `<a class="social-quiet-face" href="${escapeHtml(profileHref(member.profile))}" title="${escapeHtml(displayName(member.profile))}" aria-label="${escapeHtml(displayName(member.profile))}"><img src="${escapeHtml(avatarFor(member.profile))}" alt="" loading="lazy" /></a>`
            )
            .join('');
        const label = `${quiet.length} quiet lately`;
        return `<div class="social-band-quiet" title="No listen in the last 30 days">
            <span class="social-quiet-faces">${faces}</span>
            <span class="social-quiet-label">${escapeHtml(label)}</span>
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
        this.members = ranked;
        // Past 30 days without a listen a member leaves the band for the quiet faces; you never do.
        const credits = ranked.filter((member) => member.isMe || (member.track && member.depth < 1));
        const quiet = ranked.filter((member) => !member.isMe && !(member.track && member.depth < 1));
        const row = root.querySelector('[data-band-row]');
        const items = credits.map((member) => ({ key: member.user, html: this.creditHTML(member) }));
        if (quiet.length) items.push({ key: 'quiet', html: this.quietHTML(quiet) });
        const first = !row.dataset.ready;
        const { created } = patchKeyed(row, items, { animateNew: true });
        if (first) {
            // The band introduces itself once: credits settle in left to right.
            created.forEach((node, index) => node.style.setProperty('--enter-delay', `${Math.min(index, 8) * 45}ms`));
        }
        row.dataset.ready = '1';
        root.querySelectorAll('.social-credit').forEach((credit) => {
            coverColor(credit.querySelector('[data-band-cover]'), (color) => credit.style.setProperty('--tint', color));
        });
        this.fadeEdges();
        this.tick();
        this.startTicker();
    }

    /** Live hairlines follow each friend's extrapolated position, once a second. */
    tick() {
        const root = this.root;
        if (!root) return;
        root.querySelectorAll('.social-credit.is-live').forEach((credit) => {
            const member = this.members.find((entry) => entry.user === credit.dataset.user);
            if (!member?.track) return;
            const duration = this.durationOf(member);
            if (!duration) {
                this.meta(member.track.id).then((meta) => {
                    if (meta?.duration && !this.durations.has(member.track.id)) {
                        this.durations.set(member.track.id, Number(meta.duration));
                        this.tick();
                    }
                });
                return;
            }
            credit.style.setProperty('--progress', (this.positionOf(member) / duration).toFixed(4));
        });
    }

    startTicker() {
        if (this.timer) return;
        this.timer = setInterval(() => {
            if (document.hidden || !document.getElementById('page-social')?.classList.contains('active')) return;
            if (!this.members.some((member) => member.playing)) return;
            this.tick();
        }, 1000);
    }

    /** The row fades only on the side that still hides credits. */
    fadeEdges() {
        const row = this.root?.querySelector('[data-band-row]');
        if (!row) return;
        const scrolls = row.scrollWidth > row.clientWidth + 2;
        row.classList.toggle('is-overflowing', scrolls);
        row.style.setProperty('--fade-start', scrolls && row.scrollLeft > 4 ? '48px' : '0px');
        row.style.setProperty(
            '--fade-end',
            scrolls && row.scrollLeft + row.clientWidth < row.scrollWidth - 4 ? '64px' : '0px'
        );
    }

    /* --------------------------------- actions -------------------------------- */

    async listenAlong(userId) {
        const member = this.members.find((entry) => entry.user === userId);
        const trackId = member?.track?.id;
        if (!trackId) return;
        pulse(this.root?.querySelector(`.social-credit[data-user="${CSS.escape(userId)}"]`), 'is-joining');
        const meta = await this.meta(trackId);
        if (meta?.duration) this.durations.set(trackId, Number(meta.duration));
        const start = member.playing ? this.positionOf(member) : 0;
        await this.manager.playTrackAt(trackId, start);
        setTimeout(() => this.render(), 700);
    }

    bind() {
        if (this.bound) return;
        const root = this.root;
        if (!root) return;
        this.bound = true;
        root.addEventListener('click', (event) => {
            const listen = event.target.closest('[data-band-listen]');
            if (listen) {
                this.listenAlong(listen.dataset.bandListen).catch(console.error);
                return;
            }
            const message = event.target.closest('[data-band-message]');
            if (message) {
                this.manager.openConversationForUser(message.dataset.bandMessage).catch(console.error);
                return;
            }
            const follow = event.target.closest('[data-band-follow]');
            if (follow) {
                this.manager.toggleFollow(follow.dataset.bandFollow).catch(console.error);
                return;
            }
            if (event.target.closest('[data-band-share]')) this.manager.feed?.postNowPlaying();
        });
        const row = root.querySelector('[data-band-row]');
        new ResizeObserver(() => this.fadeEdges()).observe(root);
        row?.addEventListener('scroll', () => this.fadeEdges(), { passive: true });
        // The row's content widens without the band resizing: late webfonts, and the
        // staggered entrance settling.
        row?.addEventListener('animationend', (event) => {
            if (event.target.parentElement === row) this.fadeEdges(); // a credit's entrance, not inner pings
        });
        void document.fonts?.ready.then(() => this.fadeEdges());
        // A vertical wheel moves the band sideways, the way it reads.
        row?.addEventListener(
            'wheel',
            (event) => {
                if (!row.classList.contains('is-overflowing') || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
                row.scrollLeft += event.deltaY;
                event.preventDefault();
            },
            { passive: false }
        );
    }
}
