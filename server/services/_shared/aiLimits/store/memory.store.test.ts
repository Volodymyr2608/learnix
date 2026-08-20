import { beforeEach, describe, expect, it } from "vitest";
import {
	__windowSizeForTest,
	EVICT_THRESHOLD,
	memoryStore,
} from "./memory.store";

const WINDOW_MS = 60_000;

describe("memoryStore", () => {
	beforeEach(() => memoryStore.resetForTest());

	it("allows up to max then rejects", async () => {
		for (let i = 0; i < 3; i++) {
			expect(
				await memoryStore.checkAndBump([{ key: "k", max: 3 }], WINDOW_MS),
			).toBe(true);
		}

		expect(
			await memoryStore.checkAndBump([{ key: "k", max: 3 }], WINDOW_MS),
		).toBe(false);
	});

	it("increments nothing when any window is already at its ceiling", async () => {
		await memoryStore.checkAndBump([{ key: "full", max: 1 }], WINDOW_MS);

		expect(
			await memoryStore.checkAndBump(
				[
					{ key: "full", max: 1 },
					{ key: "fresh", max: 10 },
				],
				WINDOW_MS,
			),
		).toBe(false);
		// The rejection must not have spent the second window.
		expect(await memoryStore.countForTest("fresh")).toBe(0);
	});

	it("checks every window before incrementing any", async () => {
		// "second" is the one at its ceiling; "first" must be left alone.
		await memoryStore.checkAndBump([{ key: "second", max: 1 }], WINDOW_MS);

		await memoryStore.checkAndBump(
			[
				{ key: "first", max: 10 },
				{ key: "second", max: 1 },
			],
			WINDOW_MS,
		);

		expect(await memoryStore.countForTest("first")).toBe(0);
	});

	it("expires a window once it is past", async () => {
		await memoryStore.checkAndBump([{ key: "short", max: 1 }], 50);
		expect(await memoryStore.checkAndBump([{ key: "short", max: 1 }], 50)).toBe(
			false,
		);

		await new Promise((resolve) => setTimeout(resolve, 80));

		expect(await memoryStore.checkAndBump([{ key: "short", max: 1 }], 50)).toBe(
			true,
		);
	});

	it("evicts under pressure rather than growing without bound", async () => {
		for (let i = 0; i < EVICT_THRESHOLD * 2; i++) {
			await memoryStore.checkAndBump([{ key: `k-${i}`, max: 10 }], WINDOW_MS);
		}

		expect(__windowSizeForTest()).toBeLessThanOrEqual(EVICT_THRESHOLD + 2);
	});
});
