import {
	eachDayOfInterval,
	eachMonthOfInterval,
	formatISO,
	subDays,
} from "date-fns";

const keyOf = (d: Date, bucket: "day" | "month") =>
	bucket === "day"
		? formatISO(d, { representation: "date" })
		: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

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
	const starts =
		bucket === "day"
			? eachDayOfInterval({ start: since, end: subDays(now, 1) })
			: eachMonthOfInterval({ start: since, end: now });
	const byKey = new Map(rows.map((r) => [keyOf(r.period, bucket), r] as const));
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