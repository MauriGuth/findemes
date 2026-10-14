/** Weekly retention by signup cohort (ADR 017). Weeks start on Monday, Argentina dates. */
export interface RetentionCohort {
  /** Monday of the signup week, "YYYY-MM-DD". */
  week: string;
  users: number;
  /** retained[i] = users of the cohort active in week i+1 after signing up. */
  retained: number[];
}

const DAY_MS = 86_400_000;

/** Monday (UTC date) of the week of an ISO date. */
export function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
}

function weeksBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / (7 * DAY_MS),
  );
}

export function weeklyRetention(
  users: readonly { id: string; signupDay: string }[],
  activity: readonly { userId: string; day: string }[],
  today: string,
  horizon = 4,
): RetentionCohort[] {
  const activeWeeks = new Map<string, Set<string>>();
  for (const a of activity) {
    const set = activeWeeks.get(a.userId) ?? new Set<string>();
    set.add(mondayOf(a.day));
    activeWeeks.set(a.userId, set);
  }
  const thisWeek = mondayOf(today);
  const cohorts = new Map<string, string[]>();
  for (const u of users) {
    const week = mondayOf(u.signupDay);
    cohorts.set(week, [...(cohorts.get(week) ?? []), u.id]);
  }
  return [...cohorts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, ids]) => {
      const elapsed = Math.min(horizon, weeksBetween(week, thisWeek));
      const retained = Array.from({ length: Math.max(0, elapsed) }, (_, i) => {
        const target = new Date(new Date(`${week}T00:00:00Z`).getTime() + (i + 1) * 7 * DAY_MS)
          .toISOString()
          .slice(0, 10);
        return ids.filter((id) => activeWeeks.get(id)?.has(target)).length;
      });
      return { week, users: ids.length, retained };
    });
}
