// Recap release schedule, which the PocketBase hook owns. Usage: node --test scripts/test-listening-schedule.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { policyFor } = createRequire(import.meta.url)('../pb_hooks/listening-schedule.cjs');
const recapsAt = (iso) => policyFor({}, Date.parse(iso), 0).recaps.items;

test('the week lands on Sunday and the month on its last day', () => {
    // Monday: the week before is ready, the month is not until its last day.
    assert.deepEqual(recapsAt('2026-10-26T01:00:00Z'), [{ period: 'week', anchor: '2026-10-19' }]);
    // Sunday: the week that is ending drops.
    assert.deepEqual(recapsAt('2026-10-25T23:00:00Z'), [{ period: 'week', anchor: '2026-10-19' }]);
    // Last day of October: the month drops.
    assert.deepEqual(recapsAt('2026-10-31T12:00:00Z'), [{ period: 'month', anchor: '2026-10-01' }]);
});

test('a Sunday that is also the first of the year offers the week and the month together', () => {
    assert.deepEqual(recapsAt('2027-01-03T12:00:00Z'), [
        { period: 'week', anchor: '2026-12-28' },
        { period: 'month', anchor: '2026-12-01' },
    ]);
});
