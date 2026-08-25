import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 38: "Sentry.flush() is never called inside an SSE stream body ...".
 *
 * `flush()` drains the SDK's internal queue and, unlike `captureException`/
 * `captureMessage` (server/observability/availability.integration.test.ts proves
 * those never block a request), it returns a promise a caller could genuinely
 * `await` — one that wallclock-waits up to `shutdownTimeout`/its own argument
 * before resolving. Calling it from inside a `ReadableStream`'s `start()` would
 * hold the SSE turn open toward Sentry rather than the 120s turn deadline
 * `_shared/aiLimits/modelDefaults.ts` protects. AC 38 allows `flush()` elsewhere
 * (bounded, `SENTRY_FLUSH_TIMEOUT_MS <= 2_000`) — just never inside the stream body
 * — so this scans only that body, not the whole file.
 *
 * Routes are discovered by walking `app/api/chat` (same `walk()` technique as
 * bodyValidation.contract.test.ts in this directory) rather than a hardcoded
 * list, so a newly added `route.ts` is picked up automatically. A discovered
 * route is only "in scope" for this check if it actually contains a
 * `ReadableStream<Uint8Array>({` literal — a future chat route with no SSE
 * body has nothing for `Sentry.flush()` to block, so it's skipped rather than
 * forced into this shape. Each in-scope route wraps exactly one such literal,
 * immediately followed by the `return new Response(stream, {` that ships it —
 * slicing the source between those two markers isolates the stream body
 * precisely, and throws if a route's shape ever stops matching that pattern
 * (started the literal but never returned it), rather than silently scanning
 * nothing.
 */
const ROOT = "app/api/chat";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

const ROUTES = walk(join(process.cwd(), ROOT))
	.map((abs) => abs.slice(process.cwd().length + 1))
	.filter((rel) => rel.endsWith("/route.ts"))
	.sort();

const STREAM_START = "new ReadableStream<Uint8Array>({";
const STREAM_END = "return new Response(stream,";

const hasStreamBody = (file: string): boolean =>
	readFileSync(file, "utf-8").includes(STREAM_START);

const streamBody = (file: string): string => {
	const source = readFileSync(file, "utf-8");
	const start = source.indexOf(STREAM_START);
	const end = source.indexOf(STREAM_END);

	if (start === -1 || end === -1 || end <= start) {
		throw new Error(
			`could not isolate the ReadableStream body in ${file} — the scan's ` +
				"assumptions about this route's shape no longer hold",
		);
	}

	return source.slice(start, end);
};

describe("no Sentry.flush() inside an SSE stream body (AC 38)", () => {
	it("discovers the chat SSE routes by walking app/api/chat — the walk is not vacuous", () => {
		expect(ROUTES).toEqual([
			"app/api/chat/course/route.ts",
			"app/api/chat/learning-path/route.ts",
			"app/api/chat/lesson/route.ts",
		]);
		expect(ROUTES.filter(hasStreamBody).length).toBe(3);
	});

	it("no chat route calls Sentry.flush() from within its ReadableStream body", () => {
		const offenders = ROUTES.filter(hasStreamBody).filter((file) =>
			/Sentry\.flush\(/.test(streamBody(file)),
		);

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("isolates a non-empty body from every in-scope route — the slice itself is not vacuous", () => {
		for (const file of ROUTES.filter(hasStreamBody)) {
			expect(streamBody(file).length).toBeGreaterThan(0);
		}
	});

	it("would flag a stray Sentry.flush() call inside the stream body — non-vacuity proof", () => {
		// This exact violation was manually introduced into
		// app/api/chat/course/route.ts's stream body, confirmed to fail the first
		// assertion above, then reverted — see task-15-report.md. This simulates
		// the same violation in-test so the proof stays part of the suite,
		// matching the convention in buildConfig.contract.test.ts and
		// importBoundary.contract.test.ts.
		const withViolation = `${streamBody("app/api/chat/course/route.ts")}\nawait Sentry.flush(3000);`;

		expect(/Sentry\.flush\(/.test(withViolation)).toBe(true);
	});
});
