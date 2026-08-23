import { describe, expect, it } from "vitest";
import { resolveSentryDsn } from "./resolveSentryDsn";

const DSN = "https://key@o0.ingest.sentry.io/1";

describe("resolveSentryDsn", () => {
	it.each(["development", "test"])("allows an absent DSN in %s", (nodeEnv) => {
		expect(resolveSentryDsn(nodeEnv, undefined)).toBeUndefined();
	});

	it("throws in production when the DSN is absent", () => {
		expect(() => resolveSentryDsn("production", undefined)).toThrow(
			/SENTRY_DSN must be set/,
		);
	});

	it("throws for an unset or unrecognised NODE_ENV — allowlist, not not-equals", () => {
		// lib/env.js's .default("development") does not apply under
		// SKIP_ENV_VALIDATION, which that file recommends for Docker builds. A
		// `nodeEnv !== "production"` check would silently pass all of these.
		expect(() => resolveSentryDsn("", undefined)).toThrow();
		expect(() => resolveSentryDsn("undefined", undefined)).toThrow();
		expect(() => resolveSentryDsn("preview", undefined)).toThrow();
		expect(() => resolveSentryDsn("staging", undefined)).toThrow();
	});

	it("returns the DSN whenever one is present", () => {
		expect(resolveSentryDsn("production", DSN)).toBe(DSN);
		expect(resolveSentryDsn("development", DSN)).toBe(DSN);
		expect(resolveSentryDsn("", DSN)).toBe(DSN);
	});

	it("names the variable and the consequence, so the failure is self-explaining", () => {
		expect(() => resolveSentryDsn("production")).toThrow(/SENTRY_DSN/);
		expect(() => resolveSentryDsn("production")).toThrow(/silently absent/);
	});
});
