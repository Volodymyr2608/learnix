import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_SURFACES, SHARED_MODEL_CALLERS } from "./aiSurfaces";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

const modelCallingFiles = (): string[] =>
	walk("server/services").filter((file) => /new ChatOpenAI\(/.test(code(file)));

const routeFiles = (): string[] =>
	walk("app/api/chat").filter((file) => file.endsWith("route.ts"));

const declared = <T>(pick: (s: (typeof AI_SURFACES)[number]) => T[]): T[] =>
	AI_SURFACES.flatMap(pick);

describe("the declaration is complete against the source (AC 72)", () => {
	it("names every service that constructs a model", () => {
		// Derived from the source, not from the declaration: a new surface that
		// never appears here fails, which is the direction that matters.
		const undeclared = modelCallingFiles().filter(
			(file) =>
				!declared((s) => s.modelCallers).includes(file) &&
				!SHARED_MODEL_CALLERS.includes(file),
		);

		expect(undeclared, undeclared.join("\n")).toEqual([]);
	});

	it("declares no model caller that has stopped calling a model", () => {
		const stale = [
			...declared((s) => s.modelCallers),
			...SHARED_MODEL_CALLERS,
		].filter((file) => !modelCallingFiles().includes(file));

		expect(stale, stale.join("\n")).toEqual([]);
	});

	it("covers every AiFeature exactly once", () => {
		const features = AI_SURFACES.map((s) => s.feature);

		expect(new Set(features).size).toBe(features.length);
		expect(features.sort()).toEqual([
			"courseAI",
			"learningPathAI",
			"lessonAI",
			"lessonInsightsAI",
			"quizAI",
		]);
	});
});

describe("reachability: every entry point runs a limiter (AC 46)", () => {
	it("every declared tRPC procedure carries aiRateLimit", () => {
		const routerSource = walk("server/api/routers").map(code).join("\n");

		const missing = declared((s) => s.trpcProcedures).filter((procedure) => {
			const name = procedure.split(".")[1] as string;
			const declaration = new RegExp(
				`${name}:\\s*\\w+\\s*\\n?\\s*\\.use\\(aiRateLimit\\(`,
			);
			return !declaration.test(routerSource);
		});

		expect(missing, missing.join("\n")).toEqual([]);
	});

	it("every declared raw route calls checkAiRateLimit", () => {
		const missing = declared((s) => s.rawRoutes).filter(
			(route) => !/checkAiRateLimit\(/.test(code(route)),
		);

		expect(missing, missing.join("\n")).toEqual([]);
	});

	it("finds no model-calling raw route that the declaration omits", () => {
		const modelRoutes = routeFiles().filter((file) =>
			/courseAIService|lessonAIService|learningPathAIService|streamRegenerate|runChat/.test(
				code(file),
			),
		);

		const undeclared = modelRoutes.filter(
			(file) => !declared((s) => s.rawRoutes).includes(file),
		);

		expect(undeclared, undeclared.join("\n")).toEqual([]);
	});

	it("finds the routes at all — the scan is not vacuous", () => {
		expect(routeFiles().length).toBeGreaterThanOrEqual(3);
		expect(declared((s) => s.rawRoutes).length).toBeGreaterThanOrEqual(3);
	});
});

describe("the output boundary is declared per rule, with reasons", () => {
	it("gives every n/a and every exception a reason", () => {
		for (const surface of AI_SURFACES) {
			const statuses = [
				surface.inputGuard,
				surface.wrapping,
				surface.renderPolicy,
				surface.resourceLimits,
				...Object.values(surface.outputBoundary),
			];

			for (const entry of statuses) {
				if (entry.status === "applied") continue;
				expect(
					entry.reason.length,
					`${surface.feature}: ${entry.status}`,
				).toBeGreaterThan(40);
			}
		}
	});

	it("does not let a surface claim off_origin_link while rendering markdown", () => {
		// The inverse of the mistake this replaces: a single "applied" value made
		// quizAI's L5 read like the tutor's. If a surface says the rule is n/a
		// because it renders no markdown, its render policy must say the same.
		for (const surface of AI_SURFACES) {
			if (surface.outputBoundary.off_origin_link.status === "n/a") {
				expect(surface.renderPolicy.status, surface.feature).toBe("n/a");
			}
		}
	});

	it("states courseAI's finalize exclusion, which no layer covers", () => {
		const courseAI = AI_SURFACES.find((s) => s.feature === "courseAI");

		expect(courseAI?.exclusions.join(" ")).toMatch(/finalize/);
	});

	it("marks a control that has not shipped as pending, never as applied", () => {
		// The matrix is only worth having if it cannot flatter the code. Every
		// pending entry has to name what it is waiting on.
		const pending = AI_SURFACES.flatMap((surface) =>
			Object.entries(surface.outputBoundary)
				.filter(([, entry]) => entry.status === "pending")
				.map(([rule, entry]) => ({ surface: surface.feature, rule, entry })),
		);

		for (const { surface, rule, entry } of pending) {
			expect(
				"reason" in entry ? entry.reason : "",
				`${surface}.${rule}`,
			).toMatch(/falsePositive|gated|measurement/i);
		}
	});

	it("says so when a surface detects without enforcing (D-M)", () => {
		// The two report-only surfaces must not read as enforcing. If either flips
		// to fail-closed later, this is what makes the matrix follow.
		const reportOnly = AI_SURFACES.filter((surface) =>
			Object.values(surface.outputBoundary).some(
				(entry) =>
					entry.status === "applied_with_exception" &&
					entry.reason.includes("Report-only"),
			),
		).map((surface) => surface.feature);

		expect(reportOnly.sort()).toEqual(["lessonInsightsAI", "quizAI"]);
	});

	it("gives every surface at least one written exclusion", () => {
		for (const surface of AI_SURFACES) {
			expect(surface.exclusions.length, surface.feature).toBeGreaterThan(0);
		}
	});
});
