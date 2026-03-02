/**
 * Planner policy constants and shared ranking rules.
 * Keep these values centralized so product assumptions are explicit.
 */
export const PLANNING_ROOM_CAPACITY = 22;

/**
 * Step 0 currently assumes room pressure is always constrained.
 * This keeps underfilled-level decisions explicit in the prototype.
 */
export const ROOM_PRESSURE_ALWAYS_CONSTRAINED = true;

export type RankedDestination<T> = {
  option: T;
  current: number;
  sameGrade: boolean;
  tieBreaker: number;
};

/**
 * Shared move ranking:
 * 1) prefer lower current roster
 * 2) tie-break with stable id
 * 3) when same-grade and cross-grade both exist, prefer same-grade only when
 *    it is not more loaded than the best cross-grade option.
 */
export function pickDestinationByGradeAndLoad<T>(ranked: RankedDestination<T>[]) {
  if (ranked.length === 0) return null;

  const byLoad = (left: RankedDestination<T>, right: RankedDestination<T>) => {
    if (left.current !== right.current) return left.current - right.current;
    return left.tieBreaker - right.tieBreaker;
  };

  const leastSame = ranked.filter((entry) => entry.sameGrade).sort(byLoad)[0];
  const leastOther = ranked.filter((entry) => !entry.sameGrade).sort(byLoad)[0];

  if (leastSame && leastOther) {
    return leastSame.current <= leastOther.current ? leastSame.option : leastOther.option;
  }

  if (leastSame) return leastSame.option;
  if (leastOther) return leastOther.option;
  return null;
}

