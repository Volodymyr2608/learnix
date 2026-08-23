import { describe, expect, it } from "vitest";
import {
	createThrottle,
	EVICT_THRESHOLD,
	SENTRY_MAX_PER_FINGERPRINT,
	SENTRY_THROTTLE_WINDOW_MS,
} from "./throttle";

describe("throttle", () => {
	it("lets through at most the budget per fingerprint", () => {
		const throttle = createThrottle(() => 0);
		const allowed = Array.from({ length: 1_000 }, () =>
			throttle.shouldThrottle("UpstashError|aiLimits"),
		).filter((dropped) => !dropped).length;

		expect(allowed).toBe(SENTRY_MAX_PER_FINGERPRINT);
	});

	it("does not suppress a different fingerprint interleaved among them", () => {
		// The Upstash-outage shape: one noisy fingerprint must not hide a real,
		// distinct failure happening at the same time (security.md S6).
		const throttle = createThrottle(() => 0);
		let otherAllowed = false;

		for (let i = 0; i < 1_000; i++) {
			const dropped = throttle.shouldThrottle(
				i === 500 ? "other" : "UpstashError|aiLimits",
			);
			if (i === 500 && !dropped) otherAllowed = true;
		}

		expect(otherAllowed).toBe(true);
	});

	it("reopens the budget after the window elapses", () => {
		let now = 0;
		const throttle = createThrottle(() => now);
		for (let i = 0; i < 50; i++) throttle.shouldThrottle("fp");

		now += SENTRY_THROTTLE_WINDOW_MS;

		expect(throttle.shouldThrottle("fp")).toBe(false);
	});

	it("stays bounded under a high-cardinality fingerprint stream", () => {
		let now = 0;
		const throttle = createThrottle(() => now);
		for (let i = 0; i < 10_000; i++) {
			now += 1;
			throttle.shouldThrottle(`fp-${i}`);
		}

		expect(throttle.sizeForTest()).toBeLessThanOrEqual(EVICT_THRESHOLD);
	});
});
