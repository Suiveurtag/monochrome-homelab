const DAY = 86400000;
// Warped, the yearly recap, ships as an update each December. Set { release: 'YYYY-MM-DD' } when it does;
// it then opens every tab and pauses the weekly and monthly recaps for a month.
const WARPED = null;
const FIELDS = ['lock_week', 'lock_month', 'lock_year', 'lock_lifetime', 'past_week', 'past_month', 'past_year'];

const parse = (key) => new Date(`${key}T00:00:00Z`);
const key = (date) => date.toISOString().slice(0, 10);
const add = (date, days) => new Date(+date + days * DAY);

function configOf(record) {
    return Object.fromEntries(FIELDS.map((field) => [field, record ? record.getBool(field) : false]));
}

// Warped stays open until the end of the following January.
function seasonOf(warped) {
    const start = parse(warped.release);
    return {
        start: +start,
        pauseEnd: Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
        end: Date.UTC(start.getUTCFullYear() + 1, 1, 1),
    };
}

// What each stats tab allows right now, in the listener's local calendar (offset: minutes east of UTC).
// latest/earliest bound the period a listener may open; earliest is null when past periods are allowed.
function policyFor(config, now, offset, warped = WARPED) {
    const local = new Date(now + offset * 60000);
    const today = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
    const dow = (today.getUTCDay() + 6) % 7; // Monday is 0.
    const season = warped && seasonOf(warped);
    const warpedOpen = Boolean(season && +today >= season.start && +today < season.end);
    const paused = Boolean(season && +today >= season.start && +today < season.pauseEnd);
    const now0 = key(today);

    // The weekly recap lands on Sunday and stays for two more days.
    const week = dow === 6 || dow <= 1;
    const weekWindow = {
        open: week,
        subject: key(add(today, -dow - (dow === 6 ? 0 : 7))),
        opensAt: key(add(today, 6 - dow)),
        closesAt: key(add(today, 3 - ((dow + 1) % 7))),
    };
    // The monthly recap lands on the last day of the month and stays for a week.
    const lastOf = (offsetMonths) =>
        new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offsetMonths + 1, 0));
    const lastDay = [lastOf(-1), lastOf(0)].find((day) => +today >= +day && +today < +add(day, 7));
    const monthWindow = {
        open: Boolean(lastDay),
        subject: lastDay && key(new Date(Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), 1))),
        opensAt: key(lastOf(0)),
        closesAt: lastDay && key(add(lastDay, 7)),
    };

    const periods = {};
    for (const [period, window] of [
        ['week', weekWindow],
        ['month', monthWindow],
    ]) {
        const held = config[`lock_${period}`] && !warpedOpen;
        const past = warpedOpen || config[`past_${period}`];
        if (held && !window.open) {
            periods[period] = { locked: true, opensAt: window.opensAt };
            continue;
        }
        const latest = held ? window.subject : now0;
        periods[period] = {
            locked: false,
            latest,
            earliest: past ? null : latest,
            closesAt: held ? window.closesAt : null,
        };
    }
    // Year and Lifetime open with Warped, which has no date until it ships.
    const opensAt = season && +today < season.start ? warped.release : null;
    const yearHeld = config.lock_year && !warpedOpen;
    periods.year = yearHeld
        ? { locked: true, opensAt }
        : { locked: false, latest: now0, earliest: warpedOpen || config.past_year ? null : now0, closesAt: null };
    periods.lifetime =
        config.lock_lifetime && !warpedOpen ? { locked: true, opensAt } : { locked: false, closesAt: null };

    const items = [];
    if (!paused && weekWindow.open) items.push({ period: 'week', anchor: weekWindow.subject });
    if (!paused && monthWindow.open) items.push({ period: 'month', anchor: monthWindow.subject });
    return {
        periods,
        recaps: { items, pausedUntil: paused ? key(new Date(season.pauseEnd)) : null },
        warped: { open: warpedOpen, release: warped?.release ?? null },
    };
}

module.exports = { FIELDS, WARPED, configOf, policyFor };
