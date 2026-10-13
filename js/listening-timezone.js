// Capture the browser's actual timezone transitions rather than applying today's
// UTC offset to an entire year. Historical and DST-boundary charts stay local.
const cache = new Map();
export function listeningTimezoneOffsets(year, lifetime = false) {
    const first = lifetime ? 2000 : year - 1;
    const last = Math.max(year, new Date().getFullYear()) + 1;
    const key = `${first}:${last}`;
    if (cache.has(key)) return cache.get(key);
    const start = Date.UTC(first, 0, 1),
        end = Date.UTC(last, 0, 1);
    const values = [{ at: start, offset: -new Date(start).getTimezoneOffset() }];
    let previous = start;
    for (let at = start + 86400000; at <= end; at += 86400000) {
        const offset = -new Date(at).getTimezoneOffset();
        if (offset !== values.at(-1).offset) {
            let low = previous,
                high = at;
            while (high - low > 60000) {
                const mid = Math.floor((low + high) / 120000) * 60000;
                if (-new Date(mid).getTimezoneOffset() === values.at(-1).offset) low = mid;
                else high = mid;
            }
            values.push({ at: high, offset });
        }
        previous = at;
    }
    const result = JSON.stringify(values);
    cache.set(key, result);
    return result;
}
