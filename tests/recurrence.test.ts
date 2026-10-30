import { describe, expect, it } from 'vitest';
import { runDate } from '../src/lib/recurrence';
import { bucketKey, localRangeToUtc } from '../src/lib/buckets';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('recurrence', () => {
  it('monthly runs clamp to month end but do not drift', () => {
    const start = new Date('2026-01-31T06:00:00Z');
    expect(iso(runDate(start, 'MONTHLY', 1))).toBe('2026-02-28');
    expect(iso(runDate(start, 'MONTHLY', 2))).toBe('2026-03-31');
    expect(iso(runDate(start, 'MONTHLY', 13))).toBe('2027-02-28');
  });
  it('weekly runs add 7 days', () => {
    expect(iso(runDate(new Date('2026-03-01T00:00:00Z'), 'WEEKLY', 3))).toBe('2026-03-22');
  });
});

describe('report buckets (Ethiopia UTC+3)', () => {
  it('uses business-local day', () => {
    // 22:00 UTC on the 1st is already the 2nd in Addis
    expect(bucketKey(new Date('2026-03-01T22:00:00Z'), 'day', 180)).toBe('2026-03-02');
  });
  it('week is keyed by Monday, month by YYYY-MM', () => {
    expect(bucketKey(new Date('2026-03-04T10:00:00Z'), 'week', 180)).toBe('2026-03-02');
    expect(bucketKey(new Date('2026-03-04T10:00:00Z'), 'month', 180)).toBe('2026-03');
  });
  it('range converts local days to UTC', () => {
    const r = localRangeToUtc('2026-03-01', '2026-03-01', 180);
    expect(r.gte.toISOString()).toBe('2026-02-28T21:00:00.000Z');
    expect(r.lt.toISOString()).toBe('2026-03-01T21:00:00.000Z');
  });
});
