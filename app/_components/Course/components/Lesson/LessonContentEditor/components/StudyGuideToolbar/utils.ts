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
 * component must not depend on whether the transport revived it.
 */
export const lastGeneratedLabel = (generatedAt: Date | string): string =>
	relativeTimeLabel(new Date(generatedAt));
