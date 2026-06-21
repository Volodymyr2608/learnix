import {
	eachDayOfInterval,
	eachMonthOfInterval,
	formatISO,
	subDays,
} from "date-fns";

/**
 * Rows' `period` comes from a Postgres `date_trunc(...)` over a
 * `timestamp without time zone` column, which the driver surfaces as a Date
 * carrying the bucket boundary in its UTC fields (e.g. 2026-03-01T00:00:00Z).
 * The boundaries we generate from `since`/`now` (built by resolveRange with
 * local constructors) are instead anchored in the server's LOCAL calendar.
 * Re-anchor each period to a Date whose LOCAL fields equal its UTC fields, so a
 * period and its matching boundary key line up regardless of the server's own
 * timezone (without this, a UTC-midnight period rolls into the previous
 * day/month for any negative-offset timezone).
 */
const toLocalFromUTCFields = (d: Date) =>
	new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

const keyOf = (d: Date, bucket: "day" | "month") =>
	bucket === "day"
		? formatISO(d, { representation: "date" })
		: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** The local-calendar bucket starts spanning [since, now]. */
function bucketStarts(since: Date, now: Date, bucket: "day" | "month"): Date[] {
	if (bucket === "month") {
		return eachMonthOfInterval({ start: since, end: now });
	}
	// Day buckets exclude "now" itself; guard the degenerate/inverted range
	// (e.g. since === now) that would otherwise walk backwards.
	const end = subDays(now, 1);
	return since > end ? [] : eachDayOfInterval({ start: since, end });
}

/**
 * Zero-fills a bucketed series so every day/month in [since, now] is present.
 * `rows` carry a `period: Date`; `empty` supplies the zero values for the other fields.
 */
export function fillBuckets<T extends Record<string, number>>(
	rows: ({ period: Date } & T)[],
	since: Date,
	now: Date,
	bucket: "day" | "month",
	empty: T,
): ({ period: string } & T)[] {
	const starts = bucketStarts(since, now, bucket);
	const byKey = new Map(
		rows.map(
			(r) => [keyOf(toLocalFromUTCFields(r.period), bucket), r] as const,
		),
	);
	return starts.map((start) => {
		const hit = byKey.get(keyOf(start, bucket));
		const values = hit ? { ...empty, ...stripPeriod(hit) } : { ...empty };
		return { period: formatISO(start, { representation: "date" }), ...values };
	});
}

function stripPeriod<T>(row: { period: Date } & T): T {
	const { period: _drop, ...rest } = row;
	return rest as T;
}
