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

	it("refuses a limit below one rather than silently returning holes", async () => {
		await expect(mapWithConcurrency([1, 2], 0, async (n) => n)).rejects.toThrow(
			/limit must be >= 1/,
		);
	});

	/** The queued path: more items than workers, every value distinct. */
	it("runs every queued item exactly once, in order", async () => {
		const runs: number[] = [];
		const out = await mapWithConcurrency(
			Array.from({ length: 10 }, (_, i) => i),
			3,
			async (n) => {
				runs.push(n);
				await new Promise((r) => setTimeout(r, 2));
				return n * 2;
			},
		);

		expect(out).toEqual(Array.from({ length: 10 }, (_, i) => i * 2));
		expect(runs.sort((a, b) => a - b)).toEqual(
			Array.from({ length: 10 }, (_, i) => i),
		);
	});
});
