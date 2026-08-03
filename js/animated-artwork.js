export const ARTWORK_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4';
export const MAX_ARTWORK_BYTES = 100 * 1024 * 1024;

export function isVideoArtwork(value) {
    if (!value) return false;
    if (typeof File !== 'undefined' && value instanceof File) return value.type === 'video/mp4';
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value.type === 'video/mp4';

    const source = String(value).trim();
    if (/^data:video\/mp4(?:;|,)/i.test(source)) return true;
    try {
        const url = new URL(source, globalThis.location?.href || 'http://localhost');
        return /\.mp4$/i.test(url.pathname);
    } catch {
        return /\.mp4(?:$|[?#])/i.test(source);
    }
}

export function isSupportedArtworkFile(file) {
    return Boolean(file && (file.type.startsWith('image/') || file.type === 'video/mp4'));
}

function copyArtworkAttributes(source, target) {
    for (const attribute of source.attributes || []) {
        if (
            ['src', 'alt', 'loading', 'autoplay', 'loop', 'muted', 'playsinline', 'preload', 'role'].includes(
                attribute.name
            )
        )
            continue;
        target.setAttribute(attribute.name, attribute.value);
    }
}

function createVideoArtwork(source, url, forcedVideo = false) {
    const video = document.createElement('video');
    copyArtworkAttributes(source, video);
    video.src = url;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('autoplay', '');
    video.setAttribute('loop', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('data-animated-artwork', 'video');
    if (forcedVideo) video.setAttribute('data-artwork-mime', 'video/mp4');
    const alt = source.getAttribute('alt');
    if (alt) video.setAttribute('aria-label', alt);
    video.setAttribute('role', 'img');
    return video;
}

function createImageArtwork(source, url) {
    const image = document.createElement('img');
    copyArtworkAttributes(source, image);
    image.src = url;
    image.alt = source.getAttribute('aria-label') || '';
    image.setAttribute('data-animated-artwork', 'image');
    return image;
}

export function renderArtworkElement(element, url, options = {}) {
    if (!element) return element;
    const video = options.video ?? isVideoArtwork(url);
    const isVideoElement = element.tagName === 'VIDEO';

    if (video && !isVideoElement) {
        const replacement = createVideoArtwork(element, url, options.video === true);
        element.replaceWith(replacement);
        void replacement.play().catch(() => {});
        return replacement;
    }
    if (!video && isVideoElement && element.dataset.animatedArtwork === 'video') {
        const replacement = createImageArtwork(element, url);
        element.replaceWith(replacement);
        return replacement;
    }

    element.src = url;
    if (isVideoElement) void element.play().catch(() => {});
    return element;
}

function scanArtwork(root) {
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    const candidates = [];
    if (root.matches?.('img[src], video[data-animated-artwork][src]')) candidates.push(root);
    candidates.push(...(root.querySelectorAll?.('img[src], video[data-animated-artwork][src]') || []));
    for (const element of candidates) {
        const source = element.getAttribute('src') || '';
        const forcedBlobVideo = source.startsWith('blob:') && element.dataset.artworkMime === 'video/mp4';
        if ((isVideoArtwork(source) || forcedBlobVideo) !== (element.tagName === 'VIDEO')) {
            renderArtworkElement(element, source);
        }
    }
}

export function installAnimatedArtworkObserver(root = document) {
    scanArtwork(root);
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') scanArtwork(mutation.target);
            for (const node of mutation.addedNodes || []) scanArtwork(node);
        }
    });
    observer.observe(root.documentElement || root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src'],
    });
    return observer;
}

export function setArtworkBackground(container, url) {
    if (!container) return;
    container.querySelector(':scope > [data-artwork-background-video]')?.remove();

    if (!url) {
        container.style.backgroundImage = '';
        container.classList.remove('has-animated-artwork-background');
        return;
    }

    if (!isVideoArtwork(url)) {
        const escaped = String(url).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
        container.style.backgroundImage = `url('${escaped}')`;
        container.classList.remove('has-animated-artwork-background');
        return;
    }

    container.style.backgroundImage = '';
    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('data-artwork-background-video', '');
    container.prepend(video);
    container.classList.add('has-animated-artwork-background');
    void video.play().catch(() => {});
}
