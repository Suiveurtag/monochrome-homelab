// js/social-share-sheet.js — the reworked "Share in Monochrome" sheet.
// Opens over any page: pick recipients (friends + groups), add a note, and for
// tracks crop a snippet of the song directly on its waveform before sending.

import { escapeHtml } from './utils.js';
import { showNotification } from './downloads.js';
import { getItemShareUrl } from './share.js';
import { waveformGenerator } from './waveform.js';
import { icon } from './social-icons.js';
import { formatDuration } from './social-utils.js';

const DEFAULT_SNIPPET_LENGTH = 30;
const HANDLE_HIT_PX = 14;

export class ShareSheet {
    constructor() {
        this.deps = null;
        this.root = null;
        this.payload = null;
        this.item = null;
        this.kind = 'track';
        this.recipients = [];
        this.selected = new Set();
        this.searchQuery = '';
        this.snippetEnabled = false;
        this.peaks = null;
        this.duration = 0;
        this.selection = null;
        this.audio = null;
        this.playing = false;
        this.dragging = null;
        this.opened = false;
        this.opener = null;
        this.bound = false;
        this.raf = 0;
    }

    bind(deps) {
        this.deps = deps;
        this.root = document.getElementById('share-sheet');
        if (!this.root || this.bound) return;
        this.bound = true;

        this.root.querySelector('[data-share-close]')?.addEventListener('click', () => this.close());
        document.getElementById('share-sheet-close')?.addEventListener('click', () => this.close());
        document.getElementById('share-sheet-search')?.addEventListener('input', (event) => {
            this.searchQuery = event.target.value;
            this.renderRecipients().catch(console.error);
        });
        document.getElementById('share-music-search')?.addEventListener('input', (event) => {
            clearTimeout(this.musicTimer);
            this.musicTimer = setTimeout(() => this.searchMusic(event.target.value).catch(console.error), 240);
        });
        document.getElementById('share-music-results')?.addEventListener('click', (event) => {
            const row = event.target.closest('[data-music-key]');
            if (!row) return;
            const entry = this.musicResults?.get(row.dataset.musicKey);
            if (!entry) return;
            this.setItem(entry.kind, entry.item);
        });
        document.getElementById('share-sheet-copy')?.addEventListener('click', () => this.copyLink());
        document.getElementById('share-sheet-send')?.addEventListener('click', () => this.send());
        document.getElementById('share-snippet-play')?.addEventListener('click', () => this.togglePreview());
        document.getElementById('share-snippet-reset')?.addEventListener('click', () => this.resetSnippet());

        const canvas = document.getElementById('share-snippet-canvas');
        canvas?.addEventListener('pointerdown', (event) => this.onPointerDown(event));
        canvas?.addEventListener('pointermove', (event) => this.onPointerMove(event));
        window.addEventListener('pointerup', (event) => this.onPointerUp(event));
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.opened) this.close();
        });
    }

    open({ payload = null, item = null, kind = 'track', preselectUser = null, preselectConversation = null } = {}) {
        if (!this.root || !this.deps) return;
        this.payload = payload ? { ...payload } : null;
        this.item = item;
        this.kind = kind;
        this.selected = new Set();
        this.searchQuery = '';
        this.musicResults = new Map();
        this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const search = document.getElementById('share-sheet-search');
        if (search) search.value = '';
        const note = document.getElementById('share-sheet-note');
        if (note) note.value = '';
        const musicSearch = document.getElementById('share-music-search');
        if (musicSearch) musicSearch.value = '';

        if (this.payload) {
            this.renderItem();
            this.setupSnippet().catch(console.error);
        } else {
            this.renderPicker();
        }
        this.renderRecipients(preselectUser, preselectConversation).catch(console.error);
        this.updateSendState();

        this.root.hidden = false;
        this.opened = true;
        document.body.classList.add('share-sheet-open');
        void this.root.offsetHeight;
        this.root.classList.add('is-open');
        (this.payload ? search : musicSearch)?.focus();
    }

    setItem(kind, item) {
        this.kind = kind;
        this.item = item;
        this.payload = this.deps.toPayload(kind, item);
        const music = document.getElementById('share-sheet-music');
        if (music) music.hidden = true;
        this.renderItem();
        this.setupSnippet().catch(console.error);
        this.updateSendState();
        document.getElementById('share-sheet-search')?.focus();
    }

    renderPicker() {
        const music = document.getElementById('share-sheet-music');
        const item = document.getElementById('share-sheet-item');
        const snippet = document.getElementById('share-sheet-snippet');
        if (item) item.hidden = true;
        if (snippet) snippet.hidden = true;
        if (!music) return;
        music.hidden = false;
        const results = document.getElementById('share-music-results');
        if (!results) return;
        const track = this.deps.nowPlaying?.();
        const nowPlayingImage = track?.raw ? this.deps.toPayload('track', track.raw)?.image : '';
        results.innerHTML = track
            ? `<button class="share-recipient share-music-result" type="button" data-music-nowplaying>
                ${nowPlayingImage ? `<img src="${escapeHtml(nowPlayingImage)}" alt="" />` : `<span class="share-recipient-initial">${icon.disc(18)}</span>`}
                <span class="share-recipient-copy"><em>Now playing</em><strong>${escapeHtml(track.title || 'Untitled')}</strong><small>${escapeHtml(track.subtitle || '')}</small></span>
            </button>
            <div class="share-sheet-empty">Or search the library above.</div>`
            : '<div class="share-sheet-empty">Search the library above to pick something to share.</div>';
        results.querySelector('[data-music-nowplaying]')?.addEventListener('click', () => {
            const current = this.deps.nowPlaying?.();
            if (current) this.setItem('track', current.raw);
        });
    }

    async searchMusic(query) {
        const results = document.getElementById('share-music-results');
        if (!results) return;
        if (!query.trim()) {
            this.renderPicker();
            return;
        }
        results.innerHTML = '<div class="share-sheet-empty">Searching…</div>';
        const found = await this.deps.searchMusic(query.trim()).catch(() => null);
        const groups = [
            ['track', found?.tracks?.items || found?.tracks || []],
            ['album', found?.albums?.items || found?.albums || []],
            ['artist', found?.artists?.items || found?.artists || []],
        ];
        this.musicResults = new Map();
        const rows = groups
            .flatMap(([kind, list]) => list.slice(0, 4).map((entry) => [kind, entry]))
            .map(([kind, entry]) => {
                const key = `${kind}:${entry.id}`;
                this.musicResults.set(key, { kind, item: entry });
                const image =
                    kind === 'track'
                        ? entry.album?.cover || entry.cover
                        : kind === 'album'
                          ? entry.cover
                          : entry.picture || entry.image;
                return `<button class="share-recipient share-music-result" type="button" data-music-key="${escapeHtml(key)}">
                    ${image ? `<img src="${escapeHtml(image)}" alt="" />` : `<span class="share-recipient-initial">${escapeHtml(kind.slice(0, 1).toUpperCase())}</span>`}
                    <span class="share-recipient-copy"><em>${escapeHtml(kind)}</em><strong>${escapeHtml(entry.title || entry.name || 'Untitled')}</strong><small>${escapeHtml(entry.artist?.name || entry.artists?.[0]?.name || '')}</small></span>
                </button>`;
            })
            .join('');
        results.innerHTML = rows || '<div class="share-sheet-empty">Nothing found.</div>';
    }

    close() {
        if (!this.root || !this.opened) return;
        this.opened = false;
        this.stopPreview();
        this.root.classList.remove('is-open');
        document.body.classList.remove('share-sheet-open');
        setTimeout(() => {
            if (!this.opened) this.root.hidden = true;
        }, 200);
        this.opener?.focus?.();
    }

    renderItem() {
        const container = document.getElementById('share-sheet-item');
        if (!container || !this.payload) return;
        const music = document.getElementById('share-sheet-music');
        if (music) music.hidden = true;
        container.hidden = false;
        const { title, subtitle, image, type } = this.payload;
        const art = image
            ? `<img src="${escapeHtml(image)}" alt="" />`
            : `<span class="share-sheet-item-fallback">${icon.disc(22)}</span>`;
        container.innerHTML = `${art}
            <div class="share-sheet-item-copy">
                <em>${escapeHtml(type || this.kind)}</em>
                <strong>${escapeHtml(title || 'Untitled')}</strong>
                <small>${escapeHtml(subtitle || '')}</small>
            </div>`;
    }

    async setupSnippet() {
        const section = document.getElementById('share-sheet-snippet');
        const toggle = document.getElementById('share-snippet-toggle');
        const editor = document.getElementById('share-snippet-editor');
        if (!section || !toggle) return;

        this.snippetEnabled = false;
        this.peaks = null;
        this.duration = 0;
        this.selection = null;
        this.stopPreview();
        if (editor) editor.hidden = true;
        section.hidden = this.payload?.type !== 'track';
        toggle.disabled = false;
        toggle.classList.remove('is-active');
        toggle.setAttribute('aria-pressed', 'false');

        if (section.hidden) return;

        const meta = await this.deps.resolveTrack(this.payload.id).catch(() => null);
        if (!meta?.serverAudioUrl) {
            toggle.disabled = true;
            toggle.title = 'Snippet sharing needs the track on this instance';
            return;
        }
        toggle.title = '';

        toggle.onclick = () => {
            this.snippetEnabled = !this.snippetEnabled;
            toggle.classList.toggle('is-active', this.snippetEnabled);
            toggle.setAttribute('aria-pressed', String(this.snippetEnabled));
            const editor = document.getElementById('share-snippet-editor');
            if (!editor) return;
            editor.hidden = !this.snippetEnabled;
            if (this.snippetEnabled) {
                if (this.peaks) this.drawWave();
                else this.loadWave(meta.serverAudioUrl).catch(console.error);
            } else {
                this.stopPreview();
                delete this.payload.snippet;
            }
        };
    }

    async loadWave(audioUrl) {
        const loading = document.getElementById('share-snippet-loading');
        if (loading) loading.hidden = false;
        const result = await waveformGenerator.getWaveform(audioUrl, `share:${this.payload.id}`).catch(() => null);
        if (loading) loading.hidden = true;
        if (!result) {
            showNotification('Could not read this track for snippets');
            this.snippetEnabled = false;
            const editor = document.getElementById('share-snippet-editor');
            if (editor) editor.hidden = true;
            return;
        }
        this.peaks = result.peaks;
        this.duration = result.duration;
        this.selection = { start: 0, end: Math.min(DEFAULT_SNIPPET_LENGTH, this.duration) };
        this.syncSnippetPayload();
        this.drawWave();
        this.updateSnippetLabels();
    }

    canvasMetrics() {
        const canvas = document.getElementById('share-snippet-canvas');
        if (!canvas) return null;
        const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 320;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(width * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(78 * dpr);
        }
        return { canvas, width, height: 78, dpr };
    }

    drawWave() {
        const metrics = this.canvasMetrics();
        const canvas = metrics?.canvas;
        if (!canvas || !this.peaks || !this.selection) return;
        const { width, height, dpr } = metrics;
        const ctx = canvas.getContext('2d');
        const styles = getComputedStyle(document.documentElement);
        const base = styles.getPropertyValue('--muted-foreground').trim() || '#888';
        const active = styles.getPropertyValue('--foreground').trim() || '#fff';

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barCount = Math.max(48, Math.floor(width / 4));
        const step = this.peaks.length / barCount;
        const barWidth = (width / barCount) * 0.48;
        const centerY = height / 2;
        const { start, end } = this.selection;
        const progress = this.playing && this.audio ? this.audio.currentTime : null;

        for (let i = 0; i < barCount; i++) {
            let peak = 0;
            const from = Math.floor(i * step);
            const to = Math.max(from + 1, Math.floor((i + 1) * step));
            for (let j = from; j < to; j++) peak = Math.max(peak, this.peaks[j] || 0);
            const x = (i / barCount) * width;
            const time = (x / width) * this.duration;
            const inRange = time >= start && time <= end;
            const barHeight = Math.max(2, peak * (height - 20));
            ctx.fillStyle = inRange ? active : base;
            ctx.globalAlpha = inRange ? 1 : 0.42;
            ctx.beginPath();
            ctx.roundRect(x * dpr, (centerY - barHeight / 2) * dpr, Math.max(1.5, barWidth) * dpr, barHeight * dpr, 2);
            ctx.fill();
        }

        if (progress !== null && progress >= start && progress <= end) {
            const x = (progress / this.duration) * width;
            ctx.globalAlpha = 1;
            ctx.fillStyle = active;
            ctx.fillRect(x * dpr, 4 * dpr, 1.5 * dpr, (height - 8) * dpr);
        }
        ctx.globalAlpha = 1;
        const brackets = document.getElementById('share-snippet-brackets');
        if (brackets) {
            brackets.style.setProperty('--selection-start', `${(start / this.duration) * 100}%`);
            brackets.style.setProperty('--selection-end', `${(end / this.duration) * 100}%`);
        }
    }

    timeAtEvent(event) {
        const canvas = document.getElementById('share-snippet-canvas');
        if (!canvas || !this.duration) return 0;
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        return ratio * this.duration;
    }

    hitZone(event) {
        if (!this.selection) return 'none';
        const canvas = document.getElementById('share-snippet-canvas');
        if (!canvas) return 'none';
        const rect = canvas.getBoundingClientRect();
        const pxPerSecond = rect.width / this.duration;
        const x = event.clientX - rect.left;
        const startPx = this.selection.start * pxPerSecond;
        const endPx = this.selection.end * pxPerSecond;
        if (Math.abs(x - startPx) <= HANDLE_HIT_PX) return 'start';
        if (Math.abs(x - endPx) <= HANDLE_HIT_PX) return 'end';
        if (x > startPx && x < endPx) return 'move';
        return 'outside';
    }

    onPointerDown(event) {
        if (!this.snippetEnabled || !this.selection) return;
        const zone = this.hitZone(event);
        if (zone === 'outside') {
            this.stopPreview();
            this.selection = { start: 0, end: Math.min(DEFAULT_SNIPPET_LENGTH, this.duration) };
            this.dragging = 'end';
            this.syncSnippetPayload();
            this.drawWave();
            this.updateSnippetLabels();
            return;
        }
        this.dragging = zone;
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    onPointerMove(event) {
        if (!this.dragging || this.dragging === 'none' || !this.selection) return;
        const time = this.timeAtEvent(event);
        const minSpan = Math.min(3, this.duration);
        if (this.dragging === 'start') {
            this.selection.start = Math.max(0, Math.min(time, this.selection.end - minSpan));
        } else if (this.dragging === 'end') {
            this.selection.end = Math.min(this.duration, Math.max(time, this.selection.start + minSpan));
        } else if (this.dragging === 'move') {
            const span = this.selection.end - this.selection.start;
            const delta = time - (this.selection.start + span / 2);
            let nextStart = this.selection.start + delta;
            nextStart = Math.max(0, Math.min(nextStart, this.duration - span));
            this.selection.start = nextStart;
            this.selection.end = nextStart + span;
        }
        this.stopPreview();
        this.syncSnippetPayload();
        this.drawWave();
        this.updateSnippetLabels();
    }

    onPointerUp() {
        this.dragging = null;
    }

    syncSnippetPayload() {
        if (!this.payload || !this.selection) return;
        const sourcePeaks = Array.from(this.peaks || []);
        const peakBucket = Math.max(1, Math.ceil(sourcePeaks.length / 240));
        const compactPeaks = sourcePeaks.length
            ? Array.from({ length: Math.ceil(sourcePeaks.length / peakBucket) }, (_, index) =>
                  Number(Math.max(...sourcePeaks.slice(index * peakBucket, (index + 1) * peakBucket)).toFixed(3))
              )
            : [];
        this.payload.snippet = {
            start: Number(this.selection.start.toFixed(2)),
            end: Number(this.selection.end.toFixed(2)),
            duration: Number(this.duration.toFixed(2)),
            peaks: compactPeaks,
        };
    }

    resetSnippet() {
        if (!this.duration) return;
        this.selection = { start: 0, end: Math.min(DEFAULT_SNIPPET_LENGTH, this.duration) };
        this.stopPreview();
        this.syncSnippetPayload();
        this.drawWave();
        this.updateSnippetLabels();
    }

    updateSnippetLabels() {
        const range = document.getElementById('share-snippet-range');
        const length = document.getElementById('share-snippet-length');
        if (!this.selection) return;
        if (range)
            range.textContent = `${formatDuration(this.selection.start)} – ${formatDuration(this.selection.end)}`;
        if (length) length.textContent = `${formatDuration(this.selection.end - this.selection.start)} long`;
    }

    togglePreview() {
        if (this.playing) {
            this.stopPreview(true);
            return;
        }
        if (!this.selection) return;
        this.deps
            .resolveTrack(this.payload.id)
            .then((meta) => {
                if (!meta?.serverAudioUrl) return;
                if (!this.audio) {
                    this.audio = new Audio();
                    this.audio.addEventListener('timeupdate', () => {
                        if (!this.selection) return;
                        if (this.audio.currentTime >= this.selection.end) {
                            this.stopPreview(true);
                            return;
                        }
                        this.drawWave();
                    });
                    this.audio.addEventListener('ended', () => this.stopPreview(true));
                }
                this.audio.src = meta.serverAudioUrl;
                this.audio.currentTime = this.selection.start;
                this.audio
                    .play()
                    .then(() => {
                        this.playing = true;
                        this.setPlayButton(true);
                        this.drawWave();
                    })
                    .catch(() => {});
            })
            .catch(() => {});
    }

    stopPreview(keepButtonStateSync = false) {
        if (this.audio) {
            this.audio.pause();
        }
        const wasPlaying = this.playing;
        this.playing = false;
        if (wasPlaying || keepButtonStateSync) this.setPlayButton(false);
        if (wasPlaying) this.drawWave();
    }

    setPlayButton(playing) {
        const button = document.getElementById('share-snippet-play');
        if (!button) return;
        button.innerHTML = playing ? icon.pause(15) : icon.play(15);
        button.setAttribute('aria-label', playing ? 'Stop preview' : 'Preview snippet');
    }

    async renderRecipients(preselectUser = null, preselectConversation = null) {
        const container = document.getElementById('share-sheet-recipients');
        if (!container) return;
        this.recipients = await this.deps.getRecipients().catch(() => []);
        if (preselectUser) {
            const match = this.recipients.find((entry) => entry.type === 'user' && entry.id === preselectUser);
            if (match) this.selected.add(match.key);
        }
        if (preselectConversation) this.selected.add(`conversation:${preselectConversation}`);
        this.paintRecipients();
    }

    paintRecipients() {
        const container = document.getElementById('share-sheet-recipients');
        if (!container) return;
        const query = this.searchQuery.trim().toLowerCase();
        const filtered = this.recipients.filter((entry) =>
            `${entry.name} ${entry.meta || ''}`.toLowerCase().includes(query)
        );
        if (!filtered.length) {
            container.innerHTML = `<div class="share-sheet-empty">${
                this.recipients.length
                    ? 'No one matches that search.'
                    : 'Follow people to share with them — their profile has a Follow button.'
            }</div>`;
            return;
        }
        container.innerHTML = filtered
            .map((entry) => {
                const selected = this.selected.has(entry.key);
                const art = entry.image
                    ? `<img src="${escapeHtml(entry.image)}" alt="" />`
                    : `<span class="share-recipient-initial">${escapeHtml((entry.name || '?').slice(0, 1).toUpperCase())}</span>`;
                return `<button class="share-recipient${selected ? ' is-selected' : ''}" type="button" data-share-recipient="${escapeHtml(entry.key)}" aria-pressed="${selected}">
                    ${art}
                    <span class="share-recipient-copy"><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.meta || '')}</small></span>
                    <span class="share-recipient-check">${selected ? icon.check(14) : ''}</span>
                </button>`;
            })
            .join('');
    }

    onRecipientClick(key) {
        if (this.selected.has(key)) this.selected.delete(key);
        else this.selected.add(key);
        this.paintRecipients();
        this.updateSendState();
    }

    updateSendState() {
        const button = document.getElementById('share-sheet-send');
        if (!button) return;
        const count = this.selected.size;
        button.disabled = count === 0;
        const label = button.querySelector('span');
        if (label) label.textContent = count > 1 ? `Send to ${count}` : 'Send';
    }

    async copyLink() {
        const url = getItemShareUrl(this.kind, this.item || this.payload);
        if (!url) {
            showNotification('Nothing to share yet');
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            showNotification('Link copied to clipboard!');
        } catch {
            showNotification('Could not copy the link');
        }
    }

    async send() {
        if (!this.selected.size || !this.payload) return;
        const note = document.getElementById('share-sheet-note')?.value?.trim() || '';
        const button = document.getElementById('share-sheet-send');
        if (button) button.disabled = true;
        try {
            const sent = [];
            for (const key of this.selected) {
                const [type, ...rest] = key.split(':');
                const conversationId =
                    type === 'conversation' ? rest.join(':') : await this.deps.ensureConversation(rest.join(':'));
                await this.deps.sendToConversation(conversationId, { body: note, share: this.payload });
                sent.push(conversationId);
            }
            showNotification(sent.length > 1 ? `Sent to ${sent.length} chats` : 'Sent');
            this.selected.clear();
            this.close();
        } catch (error) {
            showNotification(error?.message || 'Could not send');
        } finally {
            this.updateSendState();
        }
    }
}

export const shareSheet = new ShareSheet();

export function bindShareSheetRecipientClicks() {
    document.getElementById('share-sheet-recipients')?.addEventListener('click', (event) => {
        const row = event.target.closest('[data-share-recipient]');
        if (row) shareSheet.onRecipientClick(row.dataset.shareRecipient);
    });
}
