export type Frequency = 'WEEKLY' | 'MONTHLY';

export function addMonthsClamped(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()),
  );
}

/** Date of the k-th run (k=0 is the start date). Anchored to the start so months never drift. */
export function runDate(start: Date, freq: Frequency, k: number): Date {
  return freq === 'WEEKLY' ? new Date(start.getTime() + k * 7 * 86_400_000) : addMonthsClamped(start, k);
}
