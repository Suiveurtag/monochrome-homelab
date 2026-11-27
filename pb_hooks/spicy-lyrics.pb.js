/* eslint-disable no-undef */
routerAdd('GET', '/api/monochrome/spicy-lyrics/status', (e) => {
    const { spicyAdmin, spicyKey } = require(`${__hooks}/spicy-lyrics.js`);
    spicyAdmin(e);
    return e.json(200, { configured: Boolean(spicyKey(e.app)) });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/monochrome/spicy-lyrics/key', (e) => {
    const { spicyAdmin } = require(`${__hooks}/spicy-lyrics.js`);
    spicyAdmin(e);
    const key = String(e.requestInfo().body?.key || '').trim();
    if (!key || key.length > 512) throw new BadRequestError('Enter a valid Spicy Lyrics API key.');
    const collection = e.app.findCollectionByNameOrId('instance_secrets');
    const found = e.app.findRecordsByFilter(collection.id, 'id != ""', '', 1, 0);
    const record = found[0] || new Record(collection);
    record.set('spicy_lyrics_key', key);
    e.app.save(record);
    return e.json(200, { configured: true });
}, $apis.requireAuth('users'), $apis.bodyLimit(2000));

routerAdd('DELETE', '/api/monochrome/spicy-lyrics/key', (e) => {
    const { spicyAdmin } = require(`${__hooks}/spicy-lyrics.js`);
    spicyAdmin(e);
    const records = e.app.findRecordsByFilter('instance_secrets', 'id != ""', '', 1, 0);
    if (records.length) {
        records[0].set('spicy_lyrics_key', '');
        e.app.save(records[0]);
    }
    return e.json(200, { configured: false });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/monochrome/spicy-lyrics/lookup', (e) => {
    const { spicyKey, spicyHttp, toTtml } = require(`${__hooks}/spicy-lyrics.js`);
    const key = spicyKey(e.app);
    if (!key) throw new BadRequestError('Spicy Lyrics is not configured for this instance.');
    const user = e.app.findRecordById('users', e.auth.id);
    if (user.getString('access_status') !== 'active' && user.getString('role') !== 'admin')
        throw new ForbiddenError('An active account is required.');
    const body = e.requestInfo().body || {};
    const id = String(body.id || '').trim();
    if (!/^[a-zA-Z0-9]{15}$/.test(id)) throw new BadRequestError('A valid catalogue track is required.');
    const record = e.app.findRecordById('music_tracks', id);
    if (!record.getBool('use_spicy_lyrics')) throw new ForbiddenError('Spicy Lyrics is not enabled for this track.');
    const title = record.getString('title');
    const artist = record.getString('artist');
    const query = `title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(record.getString('album'))}&duration=${encodeURIComponent(String(record.getFloat('duration') || ''))}`;
    const searchResponse = spicyHttp(`https://api.spicylyrics.org/v1/tracks/search?${query}`, key);
    const search = searchResponse.body?.Body || searchResponse.body;
    const track = search.results?.find((item) => item.tier === 'exact');
    if (!track?.id) throw new NotFoundError('No exact Spicy Lyrics match was found.');
    const lyricsResponse = spicyHttp(`https://api.spicylyrics.org/v1/lyrics/${encodeURIComponent(track.id)}`, key);
    const lyrics = lyricsResponse.body?.Body || lyricsResponse.body;
    if (!lyrics || lyrics.Type !== 'Syllable') throw new NotFoundError('No syllable-synced lyrics are available.');
    const ttml = toTtml(lyrics);
    if (!ttml) throw new NotFoundError('Spicy Lyrics returned no timed lines.');
    return e.json(200, {
        ttml,
        provider: lyrics.source || 'Spicy Lyrics',
        uploader: lyrics.UploadAttribution?.Uploader || null,
        maker: lyrics.UploadAttribution?.Maker || null,
        // Preserve both complete API responses and their headers so the
        // key-specific marks remain available in the browser cache.
        raw: { search: searchResponse, lyrics: lyricsResponse },
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
}, $apis.requireAuth('users'), $apis.bodyLimit(2000));
