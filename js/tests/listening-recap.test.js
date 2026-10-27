import { expect, test, vi } from 'vitest';

vi.mock('../accounts/config.js', () => ({ pb: { authStore: { record: null } } }));
vi.mock('../accounts/pocketbase.js', () => ({ syncManager: {} }));
import { EDITIONS, POOLS, editionFor } from '../listening-recap-editions.js';

test('editions are stable per listener and period, and weekly and monthly pools never mix', () => {
    expect(editionFor('a', 'week', '2026-10-19')).toBe(editionFor('a', 'week', '2026-10-19'));
    expect(POOLS.week.some((id) => POOLS.month.includes(id))).toBe(false);
    expect(POOLS.week.length + POOLS.month.length).toBe(Object.keys(EDITIONS).length);
    const picked = (period, anchor) => [
        ...new Set(Array.from({ length: 200 }, (_, i) => editionFor(`u${i}`, period, anchor))),
    ];
    // With no edition in a pool the recap is simply shown in the neutral skin.
    expect(picked('week', '2026-10-19').sort()).toEqual(POOLS.week.length ? [...POOLS.week].sort() : [null]);
    expect(picked('month', '2026-09-01').sort()).toEqual(POOLS.month.length ? [...POOLS.month].sort() : [null]);
});
