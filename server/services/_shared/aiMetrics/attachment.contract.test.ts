import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 3. Every run root still attaches the handler.
 *
 * This is the test the root-level design is worth having. A per-call-site
 * design would need this assertion at EVERY model call — nine of them, growing
 * with each new node — and would go red every time someone added a node. Here
 * the roots are a closed, small set that changes only when a surface is added,
 * so the test is both cheaper and stricter.
 *
 * It fails in both directions: an attachment removed from a root, and a handler
 * built somewhere not on the list. The second half matters because a handler
 * constructed in a node would silently reintroduce the per-call-site pattern
 * this feature exists to avoid.
 */

const ROOTS = ["server", "app", "trpc"];

/**
 * file -> how many handlers it CONSTRUCTS.
 *
 * The two guarded chat surfaces construct theirs in the ROUTE, before the input
 * guard runs, because L2 is a model call on every turn: a handler built later
 * omits the guard's cost and starts the latency clock after a wait the student
 * already spent. It is also the only way a guard-blocked turn — which returns
 * before the service is ever called — can report a summary at all.
 */
const EXPECTED_BUILDERS: Record<string, number> = {
	"app/api/chat/lesson/route.ts": 1,
	"app/api/chat/course/route.ts": 1,
	// No input guard in front of these three, so the service is the outermost
	// point that sees the whole turn.
	"server/services/learningPathAI/learningPathAI.service.ts": 2,
	"server/services/quizAI/quizAI.service.ts": 1,
	"server/services/lessonInsightsAI/lessonInsightsAI.service.ts": 1,
};

/** file -> how many run roots in it pass a handler into a model call's config. */
const EXPECTED_ATTACHMENTS: Record<string, number> = {
	// runChat and runFinalize.
	"server/services/courseAI/courseAI.service.ts": 2,
	// The ReAct agent's streamEvents.
	"server/services/lessonAI/lessonAI.service.ts": 1,
	// regenerate() invokes, streamRegenerate() streams — metering one and not the
	// other would make the same feature's cost depend on which button was pressed.
	"server/services/learningPathAI/learningPathAI.service.ts": 2,
	"server/services/quizAI/quizAI.service.ts": 1,
	"server/services/lessonInsightsAI/lessonInsightsAI.service.ts": 1,
	// The shared L2 layer: runs outside both graphs, so no root-level config
	// reaches it and it is attached on its own, with the turn's handler threaded
	// in from the route.
	"server/services/_shared/aiGuard/topicRelevance.ts": 1,
};

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

const builders = (file: string): number =>
	(code(file).match(/aiMetricsHandler\(/g) ?? []).length;

const sourceFiles = ROOTS.flatMap(walk).filter(
	(f) => !f.endsWith(".test.ts") && !f.includes("/aiMetrics/"),
);

const attachments = (file: string): number =>
	(code(file).match(/callbacks:\s*\[/g) ?? []).length;

describe("every run root attaches the metrics handler (AC 3)", () => {
	it.each(
		Object.entries(EXPECTED_BUILDERS),
	)("%s builds %i handler(s)", (file, count) => {
		expect(builders(file)).toBe(count);
	});

	it.each(
		Object.entries(EXPECTED_ATTACHMENTS),
	)("%s passes a handler into %i model-call config(s)", (file, count) => {
		// Counted, not merely present: a file could build two handlers and pass
		// only one, and a file-wide `toMatch(/callbacks:/)` would not notice.
		expect(attachments(file)).toBe(count);
	});
});

describe("no handler is built outside the declared roots (AC 3)", () => {
	it("keeps the attachment set closed", () => {
		// A handler constructed inside a node would reintroduce the per-call-site
		// pattern — working, but drifting the moment someone adds a node and
		// forgets. Adding a root is fine; doing it without declaring it here is
		// not.
		// Scanned across server/, app/ AND trpc/: the two chat surfaces build
		// theirs in a route, so a server-only walk would no longer see them — and
		// would equally miss a stray handler added anywhere else in app/.
		const undeclared = sourceFiles.filter(
			(file) => builders(file) > 0 && !(file in EXPECTED_BUILDERS),
		);

		expect(undeclared).toEqual([]);
	});

	it("touches no courseAI graph node, which is the design being pinned", () => {
		// The whole argument for a root-level handler is that nodes stay ignorant
		// of it. If one ever imports aiMetrics, that argument has quietly died.
		const nodes = walk("server/services/courseAI/graph").filter(
			(f) => !f.endsWith(".test.ts"),
		);
		const offenders = nodes.filter((file) => /aiMetrics/.test(code(file)));

		expect(offenders).toEqual([]);
	});
});
