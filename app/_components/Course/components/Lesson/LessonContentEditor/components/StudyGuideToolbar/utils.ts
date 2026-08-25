import relativeTimeLabel from "@/lib/utils/date/relativeTime";

/**
 * The distance since a study guide was generated, in whatever unit reads
 * naturally — "3 minutes ago", "about 2 hours ago", "3 months ago".
 *
 * This replaced an inline `Intl.RelativeTimeFormat(…).format(delta, "minute")`
 * that was pinned to minutes whatever the distance, so a guide three months old
 * announced itself as "129,188 minutes ago".
 *
 * Takes `Date | string` because the value comes off a tRPC query and the
 * component must not depend on whether the transport revived it — and since
 * that widens the door to an unparseable value, it is closed here: date-fns
 * throws `RangeError` on an invalid date, and this runs inside a React render,
 * where a throw costs the whole lesson editor.
 *
 * Clamped to now because the comparison spans two clocks. A browser running a
 * few seconds behind the server would otherwise render a guide generated
 * moments ago in the future tense.
 */
export const lastGeneratedLabel = (generatedAt: Date | string): string => {
	const generated = new Date(generatedAt).getTime();
	if (Number.isNaN(generated)) return "at an unknown time";

	return relativeTimeLabel(new Date(Math.min(generated, Date.now())));
};
