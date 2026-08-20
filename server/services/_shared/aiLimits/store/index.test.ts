import { describe, expect, it } from "vitest";
import { selectStore } from "./index";
import { memoryStore } from "./memory.store";

const UPSTASH = {
	url: "https://example.upstash.io",
	token: "tok",
};

describe("selectStore", () => {
	it("uses the memory adapter outside production when Upstash is absent", () => {
		expect(selectStore({ nodeEnv: "development" })).toBe(memoryStore);
		expect(selectStore({ nodeEnv: "test" })).toBe(memoryStore);
	});

	it("uses Upstash when both credentials are present", () => {
		expect(selectStore({ nodeEnv: "development", ...UPSTASH })).not.toBe(
			memoryStore,
		);
	});

	it("uses Upstash in production", () => {
		expect(selectStore({ nodeEnv: "production", ...UPSTASH })).not.toBe(
			memoryStore,
		);
	});

	it("throws in production when the URL is missing", () => {
		// Without this, a forgotten Vercel env var puts production back on a
		// per-process Map while every test and the conformance matrix stay green.
		expect(() =>
			selectStore({ nodeEnv: "production", token: UPSTASH.token }),
		).toThrow(/KV_REST_API_URL/);
	});

	it("throws in production when the token is missing", () => {
		expect(() =>
			selectStore({ nodeEnv: "production", url: UPSTASH.url }),
		).toThrow(/KV_REST_API_TOKEN/);
	});

	it("names both variables when both are missing", () => {
		expect(() => selectStore({ nodeEnv: "production" })).toThrow(
			/KV_REST_API_URL and KV_REST_API_TOKEN/,
		);
	});

	it("never silently downgrades production to memory", () => {
		// The whole point of AC 17: absence must be loud, not a quiet fallback.
		expect(() => selectStore({ nodeEnv: "production" })).toThrow();
	});

	it("does not treat a half-configured non-production env as Upstash", () => {
		expect(selectStore({ nodeEnv: "development", url: UPSTASH.url })).toBe(
			memoryStore,
		);
	});
});
