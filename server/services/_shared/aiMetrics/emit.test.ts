import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
	mockLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));
vi.mock("@/server/utils/logger", () => ({ logger: mockLogger }));

const { emitCall, emitTurn } = await import("./emit");

/**
 * spec.md AC 4 / AC 6 / AC 9 / AC 10. The writer is the one place a metric is
 * written, shaped after `logSecurityEvent`: the field set is exhaustive by type,
 * so "no event carries free text" is enforced by a field that does not exist
 * rather than by a redaction step someone can forget.
 */

const call = {
	feature: "lessonAI",
	node: "model_request",
	model: "gpt-4o-mini",
	latencyMs: 812,
	promptTokens: 1200,
	completionTokens: 300,
	costUsd: 0.00036,
	outcome: "ok",
} as const;

const turn = {
	feature: "lessonAI",
	calls: 2,
	promptTokens: 1500,
	completionTokens: 320,
	costUsd: 0.00041,
	wallMs: 1900,
	ttftMs: 640,
	outcome: "ok",
} as const;

beforeEach(() => {
	mockLogger.info.mockClear();
	mockLogger.error.mockClear();
});

describe("emitCall / emitTurn write at info, never error (AC 10)", () => {
	it("writes one info line per call", () => {
		emitCall(call);

		expect(mockLogger.info).toHaveBeenCalledTimes(1);
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("writes one info line per turn", () => {
		emitTurn(turn);

		expect(mockLogger.info).toHaveBeenCalledTimes(1);
		expect(mockLogger.error).not.toHaveBeenCalled();
	});
});

describe("the payload carries only primitive scalars (AC 6)", () => {
	it("emits no object value on the call line", () => {
		emitCall(call);

		const [fields] = mockLogger.info.mock.calls[0] ?? [];
		for (const value of Object.values(fields as Record<string, unknown>)) {
			expect(typeof value === "object" && value !== null).toBe(false);
		}
	});

	it("emits no object value on the turn line", () => {
		emitTurn(turn);

		const [fields] = mockLogger.info.mock.calls[0] ?? [];
		for (const value of Object.values(fields as Record<string, unknown>)) {
			expect(typeof value === "object" && value !== null).toBe(false);
		}
	});

	it("carries an unpriced cost as null rather than dropping the field (AC 2)", () => {
		emitCall({ ...call, costUsd: null });

		const [fields] = mockLogger.info.mock.calls[0] ?? [];
		expect(fields).toHaveProperty("costUsd", null);
	});

	it("omits ttftMs rather than emitting zero for a non-streaming turn (AC 13)", () => {
		emitTurn({ ...turn, ttftMs: undefined });

		const [fields] = mockLogger.info.mock.calls[0] ?? [];
		expect(fields).not.toHaveProperty("ttftMs");
	});
});

describe("the meter cannot break the path it measures (AC 9)", () => {
	it("swallows a throwing sink on the call line", () => {
		mockLogger.info.mockImplementationOnce(() => {
			throw new Error("sink is down");
		});

		expect(() => emitCall(call)).not.toThrow();
	});

	it("swallows a throwing sink on the turn line", () => {
		mockLogger.info.mockImplementationOnce(() => {
			throw new Error("sink is down");
		});

		expect(() => emitTurn(turn)).not.toThrow();
	});
});
