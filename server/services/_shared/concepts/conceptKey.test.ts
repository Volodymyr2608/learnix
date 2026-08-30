import { describe, expect, it } from "vitest";
import {
	canonicalConceptSpelling,
	conceptKey,
	resolveAllowlistedConcept,
} from "./conceptKey";

const NBSP = " ";
const THIN_SPACE = " ";
const COMBINING_ACUTE = "́";

describe("conceptKey", () => {
	it("is idempotent", () => {
		for (const raw of ["  API   Routes ", "api routes", "C#", "Recursion"]) {
			expect(conceptKey(conceptKey(raw))).toBe(conceptKey(raw));
		}
	});

	it("collapses padding and internal runs to one key", () => {
		expect(conceptKey("  API   Routes ")).toBe(conceptKey("api routes"));
		expect(conceptKey("API\tRoutes")).toBe(conceptKey("api routes"));
		expect(conceptKey("API\n\nRoutes")).toBe(conceptKey("api routes"));
		expect(conceptKey("API\vRoutes")).toBe(conceptKey("api routes"));
		expect(conceptKey("API\fRoutes")).toBe(conceptKey("api routes"));
		expect(conceptKey("API\r\nRoutes")).toBe(conceptKey("api routes"));
	});

	it("does not collide distinct names", () => {
		expect(conceptKey("C#")).not.toBe(conceptKey("C"));
		expect(conceptKey("Server Components")).not.toBe(
			conceptKey("Server Actions"),
		);
	});

	it("returns the empty string for a name that is only padding", () => {
		expect(conceptKey("   \t\n ")).toBe("");
	});

	// Parity with the SQL backfill, asserted against a real database by Task 2's
	// keyParity test. JS `\s` matches U+00A0 and U+2009; POSIX `[[:space:]]` does
	// not, so folding them here would fold more aggressively than the backfill and
	// bind a write to the wrong row.
	describe("folds no more aggressively than the SQL backfill", () => {
		it("treats U+00A0 and U+2009 as ordinary characters, not whitespace", () => {
			expect(conceptKey(`API${NBSP}Routes`)).not.toBe(conceptKey("api routes"));
			expect(conceptKey(`API${THIN_SPACE}Routes`)).not.toBe(
				conceptKey("api routes"),
			);
			expect(conceptKey(`${NBSP}API Routes${NBSP}`)).toBe(
				`${NBSP}api routes${NBSP}`,
			);
		});

		it("case-folds ASCII only, leaving `İ` and `ß` untouched", () => {
			// `lower('İ')` under a UTF-8 locale drops the combining dot;
			// `"İ".toLowerCase()` expands to U+0069 U+0307. The two disagree, so the
			// key folds only the range on which every collation agrees.
			expect(conceptKey("İ")).toBe("İ");
			expect(conceptKey("ß")).toBe("ß");
			expect(conceptKey("Straße")).toBe("straße");
		});

		it("leaves combining marks in place", () => {
			const composed = "Café";
			const decomposed = `Cafe${COMBINING_ACUTE}`;
			expect(conceptKey(composed)).not.toBe(conceptKey(decomposed));
			expect(conceptKey(decomposed)).toBe(`cafe${COMBINING_ACUTE}`);
		});
	});
});

describe("canonicalConceptSpelling", () => {
	it("collapses padding while preserving case", () => {
		expect(canonicalConceptSpelling("  API   Routes ")).toBe("API Routes");
	});

	it("rejects a name that is only padding", () => {
		expect(canonicalConceptSpelling("   ")).toBeNull();
	});

	it("rejects a name over the storable length", () => {
		expect(canonicalConceptSpelling("x".repeat(81))).toBeNull();
		expect(canonicalConceptSpelling("x".repeat(80))).toBe("x".repeat(80));
	});

	it("measures length after collapsing, not before", () => {
		expect(canonicalConceptSpelling(`  ${"x".repeat(80)}  `)).toBe(
			"x".repeat(80),
		);
	});
});

describe("resolveAllowlistedConcept", () => {
	it("returns the allowlist spelling, never the needle's", () => {
		const resolved = resolveAllowlistedConcept("api   routes", [
			"API Routes",
			"Middleware",
		]);
		expect(resolved).toEqual({ concept: "API Routes", key: "api routes" });
	});

	it("canonicalises padding carried by the allowlist entry itself", () => {
		const resolved = resolveAllowlistedConcept("api routes", [
			"  API   Routes ",
		]);
		expect(resolved).toEqual({ concept: "API Routes", key: "api routes" });
	});

	it("returns null when the needle is not allowlisted", () => {
		expect(resolveAllowlistedConcept("Recursion", ["API Routes"])).toBeNull();
	});

	it("returns null for an empty allowlist", () => {
		expect(resolveAllowlistedConcept("API Routes", [])).toBeNull();
	});

	it("returns null when the needle is only padding", () => {
		expect(resolveAllowlistedConcept("   ", ["API Routes"])).toBeNull();
	});

	it("returns null when the matching allowlist entry is not storable", () => {
		const oversized = "x".repeat(81);
		expect(resolveAllowlistedConcept(oversized, [oversized])).toBeNull();
	});

	it("takes the first allowlist entry when two share a key", () => {
		const resolved = resolveAllowlistedConcept("api routes", [
			"API Routes",
			"api  routes",
		]);
		expect(resolved?.concept).toBe("API Routes");
	});
});
