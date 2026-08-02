const VIDEO_ARTWORK_PATTERN = /(?:^|\.)mp4$/i;
const SUPPORTED_ARTWORK_TYPES = new Set([
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
]);

function urlPath(value) {
    const source = String(value || '').trim();
    if (!source) return '';
    if (/^data:/i.test(source)) return source.slice(0, source.indexOf(',') + 1);
    try {
        return new URL(source, globalThis.location?.href || 'https://monochrome.local/').pathname;
    } catch {
        return source.split(/[?#]/, 1)[0];
    }
}

export function isVideoArtwork(source, mimeType = '') {
    if (String(mimeType).toLowerCase() === 'video/mp4') return true;
    const path = urlPath(source);
    return /^data:video\/mp4[;,]/i.test(path) || VIDEO_ARTWORK_PATTERN.test(path.split('/').pop() || '');
}

export function isSupportedArtworkFile(file) {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    if (SUPPORTED_ARTWORK_TYPES.has(type)) return true;
    return /\.(?:avif|gif|jpe?g|png|webp|mp4)$/i.test(String(file.name || ''));
}

function copyPresentationAttributes(source, target) {
    for (const { name, value } of [...source.attributes]) {
        if (
            [
                'src',
                'srcset',
                'sizes',
                'poster',
                'autoplay',
                'loop',
                'muted',
                'playsinline',
                'data-artwork-media',
                'data-media-type',
            ].includes(name)
        )
            continue;
        target.setAttribute(name, value);
    }
}

function createVideo(source, mimeType = '') {
    const video = document.createElement('video');
    copyPresentationAttributes(source, video);
    video.src = source.getAttribute('src') || source.src || '';
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', source.getAttribute('alt') || source.getAttribute('aria-label') || '');
    video.setAttribute('data-artwork-media', 'video');
    if (mimeType) video.dataset.mediaType = mimeType;
    video.addEventListener(
        'error',
        () => {
            if (!video.isConnected) return;
            setArtworkSource(video, '/assets/appicon.png', 'image/png');
        },
        { once: true }
    );
    video.play().catch(() => {});
    return video;
}

function createImage(source) {
    const image = document.createElement('img');
    copyPresentationAttributes(source, image);
    image.src = source.getAttribute('src') || source.src || '';
    image.alt = source.getAttribute('aria-label') || source.getAttribute('alt') || '';
    return image;
}

export function setArtworkSource(element, source, mimeType = '') {
    if (!element) return null;
    const wantsVideo = isVideoArtwork(source, mimeType);
    const isGeneratedVideo = element.tagName === 'VIDEO' && element.dataset.artworkMedia === 'video';

    if (wantsVideo && element.tagName !== 'VIDEO') {
        element.setAttribute('src', source);
        if (mimeType) element.dataset.mediaType = mimeType;
        const video = createVideo(element, mimeType);
        element.replaceWith(video);
        return video;
    }

    if (!wantsVideo && isGeneratedVideo) {
        element.setAttribute('src', source);
        const image = createImage(element);
        element.replaceWith(image);
        return image;
    }

    element.src = source;
    if (mimeType) element.dataset.mediaType = mimeType;
    return element;
}

export function setArtworkBackground(element, source) {
    if (!element) return;
    element.querySelector(':scope > .artwork-background-video')?.remove();
    if (!source) {
        element.style.backgroundImage = '';
        return;
    }
    if (!isVideoArtwork(source)) {
        element.style.backgroundImage = `url("${String(source).replaceAll('"', '\\"')}")`;
        return;
    }

    element.style.backgroundImage = '';
    const video = document.createElement('video');
    video.className = 'artwork-background-video';
    video.src = source;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-hidden', 'true');
    element.prepend(video);
    video.play().catch(() => {});
}

function upgradeArtwork(root = document) {
    const images = root.matches?.('img[src]') ? [root] : [...(root.querySelectorAll?.('img[src]') || [])];
    for (const image of images) {
        const source = image.getAttribute('src') || '';
        if (isVideoArtwork(source, image.dataset.mediaType)) setArtworkSource(image, source, image.dataset.mediaType);
    }
}

export function initializeArtworkMedia(root = document) {
    if (!root?.querySelectorAll || root.documentElement?.dataset.artworkMediaReady === 'true') return;
    if (root.documentElement) root.documentElement.dataset.artworkMediaReady = 'true';
    upgradeArtwork(root);
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
                upgradeArtwork(mutation.target);
                const element = mutation.target;
                if (
                    element.tagName === 'VIDEO' &&
                    element.dataset.artworkMedia === 'video' &&
                    !isVideoArtwork(element.getAttribute('src'), element.dataset.mediaType)
                ) {
                    setArtworkSource(element, element.getAttribute('src') || '');
                }
                continue;
            }
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) upgradeArtwork(node);
            }
        }
    });
    observer.observe(root.documentElement || root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src'],
    });
    return observer;
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') initializeArtworkMedia();
