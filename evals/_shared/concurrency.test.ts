import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

/**
 * Judge calls are token-heavy and a provider's per-minute limit is a real
 * ceiling, so firing every row at once turns a quality measurement into a page
 * of 429s that look exactly like judge failures. The limit is the fix; this
 * pins that it is actually applied.
 */
describe("mapWithConcurrency", () => {
	it("returns results in input order, not completion order", async () => {
		const out = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
			await new Promise((r) => setTimeout(r, ms));
			return ms;
		});

		expect(out).toEqual([30, 10, 20]);
	});

	it("never runs more than the limit at once", async () => {
		let running = 0;
		let peak = 0;

		await mapWithConcurrency(
			Array.from({ length: 10 }, (_, i) => i),
			3,
			async () => {
				running += 1;
				peak = Math.max(peak, running);
				await new Promise((r) => setTimeout(r, 5));
				running -= 1;
				return null;
			},
		);

		expect(peak).toBeLessThanOrEqual(3);
		expect(peak).toBeGreaterThan(1);
	});

	it("handles an empty input", async () => {
		expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
	});
});
