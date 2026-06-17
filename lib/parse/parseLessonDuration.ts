/** Best-effort parse of legacy free-text lesson durations into minutes.
 *  Returns null when the value cannot be confidently read as a lesson length. */
export function parseLessonDuration(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "") return null;

  // "mm:ss" → minutes (floor)
  const clock = s.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return Number.parseInt(clock[1]!, 10);

  // "1h 30m", "1h", "90m", "30 min", "1.5 hours"
  const hoursMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  const minsMatch = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (hoursMatch || minsMatch) {
    const hours = hoursMatch ? Number.parseFloat(hoursMatch[1]!) : 0;
    const mins = minsMatch ? Number.parseInt(minsMatch[1]!, 10) : 0;
    const total = Math.round(hours * 60 + mins);
    return total > 0 ? total : null;
  }

  // bare number → minutes
  const bare = s.match(/^(\d+)$/);
  if (bare) {
    const n = Number.parseInt(bare[1]!, 10);
    return n > 0 ? n : null;
  }

  // weeks/days and anything else → unknown
  return null;
}