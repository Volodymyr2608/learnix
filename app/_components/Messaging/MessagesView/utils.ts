/** Up to two uppercase initials from a display name, e.g. "Ada Lovelace" → "AL". */
export function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const first = parts[0] ?? "";
	if (!first) return "?";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	const last = parts[parts.length - 1] ?? "";
	return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

// The one spot of color in an otherwise neutral UI: a person's avatar tint is
// derived from their name, so identity — not decoration — carries the hue.
// Each entry is dark-mode aware so the tint stays legible in both themes.
const AVATAR_COLORS = [
	"bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
	"bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
	"bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
	"bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
	"bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
	"bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
] as const;

/** Deterministic, theme-aware avatar tint derived from a stable seed (a name). */
export function getAvatarColorClass(seed: string): string {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) | 0;
	}
	const index = Math.abs(hash) % AVATAR_COLORS.length;
	return AVATAR_COLORS[index] ?? "bg-muted text-foreground";
}
