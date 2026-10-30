export type GroupBy = 'day' | 'week' | 'month';

/** Bucket key in business-local time. offsetMin = minutes ahead of UTC (Ethiopia: 180). */
export function bucketKey(date: Date, groupBy: GroupBy, offsetMin: number): string {
  const local = new Date(date.getTime() + offsetMin * 60_000);
  const day = local.toISOString().slice(0, 10);
  if (groupBy === 'day') return day;
  if (groupBy === 'month') return day.slice(0, 7);
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.parse(day + 'T00:00:00Z') - dow * 86_400_000);
  return monday.toISOString().slice(0, 10); // week identified by its Monday
}

export function localRangeToUtc(from: string, to: string, offsetMin: number) {
  const shift = offsetMin * 60_000;
  return {
    gte: new Date(Date.parse(from + 'T00:00:00Z') - shift),
    lt: new Date(Date.parse(to + 'T00:00:00Z') + 86_400_000 - shift),
  };
}
