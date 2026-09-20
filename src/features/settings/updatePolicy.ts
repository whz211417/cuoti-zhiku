const AUTOMATIC_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function shouldRunAutomaticCheck(lastCheckedAt: string | null, now: Date): boolean {
  if (!lastCheckedAt) return true;
  const lastCheckedTime = Date.parse(lastCheckedAt);
  if (Number.isNaN(lastCheckedTime)) return true;
  const elapsed = now.getTime() - lastCheckedTime;
  return elapsed < 0 || elapsed >= AUTOMATIC_CHECK_INTERVAL_MS;
}
