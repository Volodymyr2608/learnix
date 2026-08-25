import { beforeEach, describe, expect, it, vi } from "vitest";

const { reportMessage, reportError } = vi.hoisted(() => ({
	reportMessage: vi.fn(),
	reportError: vi.fn(),
}));

vi.mock("@/server/observability/reportError", () => ({
	reportMessage,
	reportError,
}));

const { reportClientError } = await import("./actions");

/**
 * spec.md AC 7/23/24, security.md S5. This action is the one unauthenticated write path
 * into the Sentry issue stream, so what it can choose — and cannot choose — is the
 * control.
 */
describe("reportClientError", () => {
	beforeEach(() => {
		reportMessage.mockClear();
		reportError.mockClear();
	});

	const valid = { errorClass: "TypeError", route: "/dashboard" };

	it("reports through reportMessage with a server-chosen fingerprint", async () => {
		await reportClientError(valid);

		expect(reportMessage).toHaveBeenCalledWith(
			"client_reported_error",
			["client_reported_error", "TypeError"],
			{ path: "/dashboard" },
		);
	});

	it("never routes through reportError's caller-derived fingerprint", async () => {
		await reportClientError(valid);

		expect(reportError).not.toHaveBeenCalled();
	});

	it("bounds the fingerprint an anonymous caller can mint", async () => {
		for (let i = 0; i < 500; i++) {
			await reportClientError({
				errorClass: `Evil${i}`,
				route: `/dashboard/${i}`,
			});
		}

		const fingerprints = new Set(
			reportMessage.mock.calls.map(([, fingerprint]) =>
				(fingerprint as string[]).join("|"),
			),
		);

		expect(fingerprints).toEqual(new Set(["client_reported_error|other"]));
	});

	it("drops a payload that fails the schema rather than reporting it", async () => {
		await reportClientError({ errorClass: "click here", route: "/dashboard" });
		await reportClientError({ message: "free text", route: "/dashboard" });

		expect(reportMessage).not.toHaveBeenCalled();
	});

	it("forwards no free text — the message is fixed and nothing else is passed", async () => {
		await reportClientError({
			...valid,
			digest: "abc123",
			message: "SECRET_FREE_TEXT",
		});

		expect(JSON.stringify(reportMessage.mock.calls)).not.toContain(
			"SECRET_FREE_TEXT",
		);
		expect(JSON.stringify(reportMessage.mock.calls)).not.toContain("abc123");
	});
});
