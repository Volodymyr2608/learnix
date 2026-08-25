import { beforeEach, describe, expect, it, vi } from "vitest";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/server/observability/reportError", () => ({ reportError }));

const { onRequestError } = await import("./instrumentation");

const REQUEST = {
	path: "/dashboard/billing",
	method: "GET",
	headers: { cookie: "session=SECRET_SESSION_TOKEN" },
} as const;

const CONTEXT = {
	routerKind: "App Router",
	routePath: "/dashboard/billing",
	routeType: "render",
	revalidateReason: undefined,
} as const;

describe("onRequestError (AC 6)", () => {
	beforeEach(() => reportError.mockClear());

	/**
	 * The hook is one of the feature's five capture points and must go through the one
	 * funnel. Re-exporting Sentry.captureRequestError — which is what shipped first —
	 * captures the raw error: no AC 10 projection, no AC 2 dedup marker, no AC 23
	 * fingerprint, no AC 41 abort filter.
	 */
	it("reports through reportError, not the SDK directly", () => {
		const error = new Error("boom");

		onRequestError(error, REQUEST, CONTEXT);

		expect(reportError).toHaveBeenCalledWith(error, "request_failed", {
			path: "/dashboard/billing",
		});
	});

	it("forwards nothing from the request — headers never reach the funnel", () => {
		onRequestError(new Error("boom"), REQUEST, CONTEXT);

		expect(JSON.stringify(reportError.mock.calls)).not.toContain(
			"SECRET_SESSION_TOKEN",
		);
	});

	it("uses the server-authored route path, so grouping is not caller-chosen", () => {
		onRequestError(new Error("boom"), REQUEST, {
			...CONTEXT,
			routePath: "/courses/[courseId]",
		});

		const [, , context] = reportError.mock.calls[0] ?? [];
		expect(context).toEqual({ path: "/courses/[courseId]" });
	});
});
