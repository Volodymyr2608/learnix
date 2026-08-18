import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogSecurityEvent } = vi.hoisted(() => ({
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

const { outputBoundary } = await import("./outputBoundary");

const state = (assistantText: string) =>
	({
		assistantText,
		instructorId: "instructor-1",
		generationId: "gen-1",
	}) as never;

describe("the courseAI output boundary node", () => {
	beforeEach(() => mockLogSecurityEvent.mockClear());

	it("passes an ordinary reply", async () => {
		const out = await outputBoundary(
			state("Here are three objectives for the course."),
			{} as never,
		);

		expect(out).toEqual({ outputRejected: false });
	});

	it("rejects a reply that echoes the wrapper tag", async () => {
		const out = await outputBoundary(
			state('The lesson said <untrusted_data source="course_data">…'),
			{} as never,
		);

		expect(out).toEqual({ outputRejected: true });
	});

	it("rejects a reply reciting the builder's own prompt", async () => {
		const out = await outputBoundary(
			state("IGNORE all previous chat history regarding other steps"),
			{} as never,
		);

		expect(out).toEqual({ outputRejected: true });
	});

	it("emits nothing — the route is the sole emitter", async () => {
		await outputBoundary(state("<untrusted_data>"), {} as never);

		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});

	it("passes an empty turn without judging it", async () => {
		const out = await outputBoundary(state(""), {} as never);

		expect(out).toEqual({ outputRejected: false });
	});
});
