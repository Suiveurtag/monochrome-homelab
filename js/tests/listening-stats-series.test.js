import { expect, test, vi } from 'vitest';

vi.mock('../accounts/config.js', () => ({ pb: {}, auth: {} }));
import { lifetimeSeries } from '../listening-stats.js';

const today = new Date('2026-10-25T15:00:00');
const day = (key, seconds = 600, streams = 3) => ({ key, seconds, streams });
const total = (items) => items.reduce((sum, item) => sum + item.seconds, 0);

test('a few days of listening becomes at least a week of daily points', () => {
    const series = lifetimeSeries(
        { activity: [{ key: '2026', seconds: 1200, streams: 6 }], days: [day('2026-10-24'), day('2026-10-25')] },
        today
    );
    expect(series.grain).toBe('day');
    expect(series.items.length).toBe(7);
    expect(series.items.at(-1).key).toBe('2026-10-25');
    expect(total(series.items)).toBe(1200);
});

test('a few months of listening groups by Monday-started weeks', () => {
    const series = lifetimeSeries({ activity: [], days: [day('2026-06-10'), day('2026-10-25')] }, today);
    expect(series.grain).toBe('week');
    expect(series.items[0].key).toBe('2026-06-08');
    expect(total(series.items)).toBe(1200);
});

test('one or two years of listening groups by month', () => {
    const series = lifetimeSeries({ activity: [], days: [day('2025-03-02'), day('2026-10-01')] }, today);
    expect(series.grain).toBe('month');
    expect(series.items[0].key).toBe('2025-03');
    expect(series.items.at(-1).key).toBe('2026-10');
    expect(series.items.length).toBe(20);
});

test('long histories keep the yearly buckets', () => {
    const activity = [{ key: '2021', seconds: 1, streams: 1 }];
    expect(lifetimeSeries({ activity, days: [day('2021-01-04')] }, today)).toEqual({ grain: 'year', items: activity });
});
