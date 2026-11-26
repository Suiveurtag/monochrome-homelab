// Adapt Spicy Lyrics' GetProgress.ts to HTMLMediaElement's sampled clock.
const RESYNC_THRESHOLD_MS = 500;
const JITTER_TIME_CONSTANT_MS = 300;

export function createBloomPlaybackClock() {
    let sample = 0;
    let sampledAt = 0;
    let position = 0;
    let updatedAt = null;

    return {
        reset() {
            updatedAt = null;
        },

        read(media, now) {
            const measured = media.currentTime * 1000;
            const rate = media.playbackRate;
            const playing = !media.paused && !media.ended && !media.seeking &&
                media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && rate > 0;

            const sampleResumed = measured !== sample && now - sampledAt >= RESYNC_THRESHOLD_MS;
            if (updatedAt === null || !playing || measured < sample || sampleResumed) {
                sample = position = measured;
                sampledAt = now;
                updatedAt = playing ? now : null;
                return measured;
            }

            if (measured !== sample) {
                sample = measured;
                sampledAt = now;
            }
            const elapsed = Math.max(0, now - updatedAt);
            const sampleAge = now - sampledAt;
            updatedAt = now;

            if (sampleAge >= RESYNC_THRESHOLD_MS) {
                position = measured;
                return position;
            }

            // The same decoded position can span several display frames.
            const livePosition = sample + sampleAge * rate;
            const predicted = position + elapsed * rate;
            const error = livePosition - predicted;
            position = Math.abs(error) > RESYNC_THRESHOLD_MS
                ? measured
                : predicted + error * (1 - Math.exp(-elapsed / JITTER_TIME_CONSTANT_MS));
            const duration = media.duration > 0 ? media.duration * 1000 : Infinity;
            position = Math.min(duration, Math.max(0, position));
            return position;
        },
    };
}
