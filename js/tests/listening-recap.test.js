import { expect, test, vi } from 'vitest';

vi.mock('../accounts/config.js', () => ({ pb: { authStore: { record: null } } }));
vi.mock('../accounts/pocketbase.js', () => ({ syncManager: {} }));
import { readyRecaps } from '../listening-recap.js';
import { EDITIONS, POOLS, editionFor } from '../listening-recap-editions.js';

test('last week is ready from Monday, last month from the 1st', () => {
    expect(readyRecaps(new Date('2026-10-26T01:00:00')).map((r) => r.key)).toEqual([
        'month:2026-09-01',
        'week:2026-10-19',
    ]);
    // Sunday still belongs to the running week, so the recap is the week before it.
    expect(readyRecaps(new Date('2026-10-25T23:00:00'))[1].anchor).toBe('2026-10-12');
    expect(readyRecaps(new Date('2027-01-03T12:00:00'))[0].anchor).toBe('2026-12-01');
});

test('editions are stable per listener and period, and weekly and monthly pools never mix', () => {
    expect(editionFor('a', 'week', '2026-10-19')).toBe(editionFor('a', 'week', '2026-10-19'));
    expect(POOLS.week.some((id) => POOLS.month.includes(id))).toBe(false);
    expect(POOLS.week.length + POOLS.month.length).toBe(Object.keys(EDITIONS).length);
    const weeks = new Set(Array.from({ length: 200 }, (_, i) => editionFor(`u${i}`, 'week', '2026-10-19')));
    const months = new Set(Array.from({ length: 200 }, (_, i) => editionFor(`u${i}`, 'month', '2026-09-01')));
    expect([...weeks].sort()).toEqual([...POOLS.week].sort());
    expect([...months].sort()).toEqual([...POOLS.month].sort());
});
