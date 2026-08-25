import { describe, expect, it } from "vitest";
import {
	CLIENT_ERROR_FINGERPRINT_ROOT,
	clientErrorFingerprint,
	KNOWN_ERROR_CLASSES,
} from "./clientErrorFingerprint";

/**
 * spec.md AC 23/24, security.md S5/S6. The client report action is a PUBLIC write path,
 * and AC 24's throttle is per fingerprint — so a caller who can mint fingerprints can
 * mint throttle budgets. This file pins the bound.
 */
describe("clientErrorFingerprint", () => {
	it("keeps a known class as its own bucket, under a fixed root", () => {
		expect(clientErrorFingerprint("TypeError")).toEqual([
			CLIENT_ERROR_FINGERPRINT_ROOT,
			"TypeError",
		]);
	});

	it("accepts every class the schema's own fixtures name", () => {
		// server/entities/errorReport.test.ts pins these three as the real shapes.
		for (const errorClass of ["TypeError", "UNAUTHORIZED", "TRPCClientError"]) {
			expect(clientErrorFingerprint(errorClass)[1]).toBe(errorClass);
		}
	});

	it("buckets anything outside the closed set", () => {
		expect(clientErrorFingerprint("AttackerChosenName")).toEqual([
			CLIENT_ERROR_FINGERPRINT_ROOT,
			"other",
		]);
	});

	it("collapses an enumeration attempt into a bounded set of fingerprints", () => {
		// The attack: `errorClass` is only shape-constrained (identifier-like, ≤100
		// chars), so 10,000 variations used to mean 10,000 fresh 10-event budgets —
		// ~500 requests to spend a 5,000-event month.
		const fingerprints = new Set(
			Array.from({ length: 10_000 }, (_, i) =>
				clientErrorFingerprint(`Error${i}`).join("|"),
			),
		);

		expect(fingerprints.size).toBe(1);
	});

	it("is bounded by the closed set even across every input, legitimate or not", () => {
		const inputs = [
			...KNOWN_ERROR_CLASSES,
			...Array.from({ length: 1_000 }, (_, i) => `Unknown${i}`),
		];
		const fingerprints = new Set(
			inputs.map((c) => clientErrorFingerprint(c).join("|")),
		);

		expect(fingerprints.size).toBe(KNOWN_ERROR_CLASSES.size + 1);
	});

	it("does not group by route, so dynamic segments cannot fragment or enumerate", () => {
		// Both an attacker walking /a, /b, /c… and a normal student on
		// /dashboard/courses/<id> would otherwise mint a fingerprint per path.
		const routes = Array.from({ length: 1_000 }, (_, i) => `/course/${i}`);

		expect(
			new Set(routes.map(() => clientErrorFingerprint("TypeError").join("|")))
				.size,
		).toBe(1);
	});
});
