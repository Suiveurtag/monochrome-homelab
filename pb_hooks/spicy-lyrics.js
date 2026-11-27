/* eslint-disable no-undef */
const spicyApiRequestTimes = [];
function spicyAdmin(e) {
    const user = e.app.findRecordById('users', e.auth.id);
    if (user.getString('role') !== 'admin') throw new ForbiddenError('Administrators only.');
}

function spicyKey(app) {
    const records = app.findRecordsByFilter('instance_secrets', 'id != ""', '', 1, 0);
    return records.length ? records[0].getString('spicy_lyrics_key') : '';
}

function spicyHttp(url, key) {
    const now = Date.now();
    while (spicyApiRequestTimes.length && now - spicyApiRequestTimes[0] >= 50000) spicyApiRequestTimes.shift();
    // Each track lookup normally uses two API calls (search + lyrics). Keep
    // ten requests in reserve under the documented 60 requests / 50 seconds.
    if (spicyApiRequestTimes.length >= 50)
        throw new ApiError(429, 'Spicy Lyrics is busy. Try again after the current request window.');
    spicyApiRequestTimes.push(now);
    const response = $http.send({
        url,
        method: 'GET',
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        timeout: 12000,
    });
    const body = response.json || {};
    if (response.statusCode < 200 || response.statusCode >= 300)
        throw new BadRequestError(body?.Body?.message || body?.message || 'Spicy Lyrics request failed.');
    return { body, headers: response.headers };
}

function xml(value) {
    return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function toTtml(data) {
    const rows = Array.isArray(data.Content) ? data.Content : [];
    const lines = rows.map((row) => {
        const syllables = row.Lead?.Syllables || [];
        const spans = syllables.map((s, index) => {
            const begin = Number(s.StartTime);
            const end = Number(s.EndTime);
            const previous = syllables[index - 1];
            const separator = previous && !previous.IsPartOfWord && !/\s$/u.test(previous.Text || '') && !/^\s/u.test(s.Text || '') ? ' ' : '';
            if (!Number.isFinite(begin) || !Number.isFinite(end) || end <= begin) return separator + xml(s.Text);
            return `${separator}<span begin="${begin.toFixed(3)}s" end="${end.toFixed(3)}s">${xml(s.Text)}</span>`;
        }).join('');
        const begin = Number(row.Lead?.StartTime ?? row.StartTime);
        const end = Number(row.Lead?.EndTime ?? row.EndTime);
        return `<p${Number.isFinite(begin) ? ` begin="${begin.toFixed(3)}s"` : ''}${Number.isFinite(end) ? ` end="${end.toFixed(3)}s"` : ''}>${spans}</p>`;
    }).join('');
    if (!lines) return '';
    return `<?xml version="1.0" encoding="UTF-8"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div>${lines}</div></body></tt>`;
}


module.exports = { spicyAdmin, spicyKey, spicyHttp, toTtml };
