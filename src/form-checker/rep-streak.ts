/**
 * Longest run of consecutive non-`unusual` reps in the set. 0 for an empty
 * set or a set with no clean run at all — never negative, never undefined.
 */
export function longestCleanStreak(reps: { unusual: boolean }[]): number {
  let longest = 0;
  let current = 0;

  for (const rep of reps) {
    if (rep.unusual) {
      current = 0;
      continue;
    }
    current += 1;
    longest = Math.max(longest, current);
  }

  return longest;
}
