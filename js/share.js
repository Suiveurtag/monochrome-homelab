// js/share.js — Spotify-style share system for Monochrome.
// Stable /share/{kind}/{id} URLs, copy / native-share helpers, dynamic Open
// Graph metadata for embeds, and in-app playback of shared items.

import { escapeHtml, getTrackArtists } from './utils.js';
import { showNotification } from './downloads.js';

/**
 * Normalize an internal content type into a share-path kind.
 * Kept tiny so every call site (context menu, social cards, player) agrees.
 */
export function normalizeShareKind(kind) {
    switch (kind) {
        case 'user-playlist':
        case 'userplaylist':
            return 'userplaylist';
        case 'video':
            return 'video';
        case 'single':
            return 'track';
        default:
            return kind || 'track';
    }
}

/**
 * Build the canonical share path for an item: /share/{kind}/{id}.
 * Prefers item.uuid for playlists (user playlists are keyed by uuid).
 */
export function buildSharePath(kind, item) {
    const normalized = normalizeShareKind(kind);
    const id = item?.uuid || item?.id;
    if (!id) return null;
    return `/share/${normalized}/${encodeURIComponent(String(id))}`;
}

/**
 * Absolute share URL for an item, based on the current origin.
 */
export function getItemShareUrl(kind, item) {
    const path = buildSharePath(kind, item);
    if (!path) return null;
    const baseUrl = window.NL_MODE ? 'https://monochrome.tf' : window.location.origin;
    return `${baseUrl}${path}`;
}

export function shareItemTitle(kind, item) {
    return kind === 'artist' ? item?.name || 'Artist' : item?.title || item?.name || 'Untitled';
}

export function shareItemSubtitle(kind, item) {
    if (kind === 'track') return getTrackArtists(item) || item?.artist?.name || 'Track';
    if (kind === 'album') return item?.artist?.name || item?.artists?.[0]?.name || 'Album';
    if (kind === 'artist') return 'Artist';
    if (kind === 'userplaylist') return 'Playlist';
    return 'Playlist';
}

export function shareItemImage(kind, item) {
    if (!item) return '';
    if (kind === 'track') return item?.album?.cover || item?.cover || '';
    if (kind === 'album') return item?.cover || item?.image || '';
    if (kind === 'artist') return item?.picture || item?.image || '';
    return item?.image || item?.cover || '';
}

export async function copyShareLink(kind, item) {
    const url = getItemShareUrl(kind, item);
    if (!url) {
        showNotification('Nothing to share yet');
        return false;
    }
    try {
        await navigator.clipboard.writeText(url);
        showNotification('Link copied to clipboard!');
        return true;
    } catch (error) {
        console.error('Failed to copy share link:', error);
        showNotification('Could not copy the link');
        return false;
    }
}

export function supportsNativeShare() {
    return typeof navigator.share === 'function';
}

export async function nativeShare(kind, item) {
    const url = getItemShareUrl(kind, item);
    if (!url) return false;
    const title = shareItemTitle(kind, item) || 'Monochrome';
    const subtitle = shareItemSubtitle(kind, item);
    const text = subtitle && subtitle !== title ? `${title} — ${subtitle}` : title;
    try {
        if (supportsNativeShare()) {
            await navigator.share({ title, text, url });
            return true;
        }
        await navigator.clipboard.writeText(url);
        showNotification('Link copied to clipboard!');
        return true;
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error('Failed to share:', error);
            await navigator.clipboard.writeText(url).catch(() => {});
            showNotification('Link copied to clipboard!');
        }
        return false;
    }
}

/**
 * Update the document's Open Graph / Twitter card meta tags so in-app embeds
 * reflect the currently viewed content. No-op-safe in any environment.
 */
export function updateShareMeta({ title = '', description = '', image = '', url = '', type = 'website' } = {}) {
    const ensure = (attr, name) => {
        let node = document.head.querySelector(`meta[${attr}="${name}"]`);
        if (!node) {
            node = document.createElement('meta');
            node.setAttribute(attr, name);
            document.head.appendChild(node);
        }
        return node;
    };
    const apply = (node, value) => {
        if (value) node.setAttribute('content', value);
        else node.removeAttribute('content');
    };

    apply(ensure('property', 'og:title'), title);
    apply(ensure('property', 'og:description'), description);
    apply(ensure('property', 'og:type'), type);
    apply(ensure('property', 'og:url'), url);
    apply(ensure('property', 'og:site_name'), 'Monochrome');
    apply(ensure('property', 'og:image'), image || '');
    if (image) {
        apply(ensure('property', 'og:image:alt'), title);
        apply(ensure('name', 'twitter:image'), image);
    }
    apply(ensure('name', 'twitter:card'), image ? 'summary_large_image' : 'summary');
    apply(ensure('name', 'twitter:title'), title);
    apply(ensure('name', 'twitter:description'), description);

    const canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical && url) canonical.setAttribute('href', url);
}

/**
 * Dispatch an in-app play request for a shared item. app.js listens for this
 * and resolves the item against the current music API.
 */
export function playSharedItem(kind, id) {
    if (!kind || !id) return;
    window.dispatchEvent(
        new CustomEvent('monochrome-play-share', {
            detail: { kind: normalizeShareKind(kind), id: String(id) },
        })
    );
}

export function shareCardHTML(payload) {
    const kind = payload?.type || 'track';
    const title = escapeHtml(payload?.title || 'Shared music');
    const subtitle = escapeHtml(payload?.subtitle || '');
    const image = payload?.image
        ? `<img src="${escapeHtml(payload.image)}" alt="" loading="lazy" />`
        : `<span class="social-share-placeholder">${escapeHtml(kind.slice(0, 1).toUpperCase())}</span>`;
    const href = escapeHtml(payload?.href || '#');
    const id = escapeHtml(payload?.id || '');
    const playable = ['track', 'album'].includes(kind);

    return `
        <div class="social-message-share" data-share-kind="${escapeHtml(normalizeShareKind(kind))}" data-share-id="${id}">
            <a class="social-share-art" href="${href}" aria-label="${title}">
                ${image}
                <span class="social-share-overlay"><span class="social-share-play">▶</span></span>
            </a>
            <a class="social-share-meta" href="${href}">
                <em>${escapeHtml(kind)}</em>
                <strong>${title}</strong>
                <small>${subtitle}</small>
            </a>
            <span class="social-share-actions">
                ${playable ? `<button class="social-share-play-btn" type="button" data-play-kind="${escapeHtml(kind)}" data-play-id="${id}" aria-label="Play ${title}">▶</button>` : ''}
                <a class="social-share-open" href="${href}" aria-label="Open ${title}">↗</a>
            </span>
        </div>`;
}
