import { describe, expect, it, vi } from "vitest";

/**
 * spec.md AC 33/35, security.md S14. The integration list is audited, not inherited:
 * the whole point of pinning it is that nothing the SDK adds by default — and nothing a
 * future release adds — can reach an event without being named here.
 *
 * `Sentry.init` is mocked so importing the config records its options instead of
 * standing up a real client (this file is otherwise reached only via
 * instrumentation.ts's `register()` at server boot).
 */
const { init } = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("@sentry/nextjs", async (importOriginal) => {
	// The package assigns most of its exports at runtime (`Object.keys(node).forEach`
	// in build/cjs/index.server.js), so they reach the ESM namespace only through
	// `default` — spreading the namespace alone loses the integration factories.
	const actual = await importOriginal<Record<string, unknown>>();

	return { ...actual, ...(actual.default as object), init };
});

await import("./sentry.server.config");

type Integration = { name: string; setupOnce: () => void };

const named = (name: string): Integration => ({ name, setupOnce: () => {} });

/**
 * A realistic stand-in for what `@sentry/nextjs`'s own `init()` hands the callback:
 * the Node defaults, plus the two entries it appends itself. It deliberately includes
 * the two S14 named as forbidden, so "the list is ours" is proved rather than assumed.
 */
const NEXT_DEFAULTS: Integration[] = [
	named("InboundFilters"),
	named("FunctionToString"),
	named("LinkedErrors"),
	named("Dedupe"),
	named("Console"),
	named("CaptureConsole"),
	named("ExtraErrorData"),
	named("Http"),
	named("DistDirRewriteFrames"),
];

const options = () => init.mock.calls[0]?.[0] as Record<string, unknown>;

const resolvedIntegrations = (): string[] => {
	const build = options().integrations as (d: Integration[]) => Integration[];
	return build(NEXT_DEFAULTS).map((i) => i.name);
};

describe("sentry.server.config", () => {
	it("goes through @sentry/nextjs's own init, not @sentry/node's plain one", () => {
		// initWithoutDefaultIntegrations is @sentry/node's, only re-exported here, so it
		// skips the isBuild guard, applySdkMetadata("nextjs"), the injected release, the
		// React control-flow drop processor and DistDirRewriteFrames.
		expect(init).toHaveBeenCalledTimes(1);
	});

	it("resolves to exactly the audited integration list", () => {
		expect(resolvedIntegrations()).toEqual([
			"LinkedErrors",
			"Dedupe",
			"InboundFilters",
			"DistDirRewriteFrames",
		]);
	});

	it("admits no default the list does not name — including the two S14 forbids", () => {
		const resolved = resolvedIntegrations();

		expect(resolved).not.toContain("CaptureConsole");
		expect(resolved).not.toContain("ExtraErrorData");
		expect(resolved).not.toContain("Console");
		expect(resolved).not.toContain("Http");
	});

	it("keeps DistDirRewriteFrames, without which uploaded source maps resolve to nothing", () => {
		expect(resolvedIntegrations()).toContain("DistDirRewriteFrames");
	});

	it("survives a default list that does not offer DistDirRewriteFrames", () => {
		const build = options().integrations as (d: Integration[]) => Integration[];

		expect(build([]).map((i) => i.name)).toEqual([
			"LinkedErrors",
			"Dedupe",
			"InboundFilters",
		]);
	});

	it("keeps traces off and PII off (AC 33, AC 18)", () => {
		expect(options().tracesSampleRate).toBe(0);
		expect(options().sendDefaultPii).toBe(false);
		expect(options().shutdownTimeout).toBe(2);
	});
});
