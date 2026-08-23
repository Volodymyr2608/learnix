import { describe, expect, it } from "vitest";
import { redactEvent } from "./redact";

describe("redactEvent", () => {
	it("strips addresses from every string leaf of the resend_failed payload", () => {
		// The exact live shape from server/services/email/email.service.ts:62-66.
		// Without this, the day the reporter ships every failed send transmits a real
		// user's address to a third-party processor (security.md S3).
		const event = {
			message: "resend_failed",
			exception: {
				values: [
					{
						type: "ResendSendError",
						value: "Invalid `to` field: alice@example.com",
					},
				],
			},
			extra: { toEmail: "bob@example.com", templateKey: "welcome" },
			contexts: { nested: { deep: ["carol@example.com"] } },
			tags: { recipient: "dave@example.com" },
		};

		expect(JSON.stringify(redactEvent(event))).not.toContain("@example.com");
	});

	it("replaces a denylisted class's message wholesale", () => {
		const event = {
			exception: {
				values: [
					{
						type: "UpstashError",
						value:
							'WRONGTYPE, command was: {"keys":["airl:v1:prod:user_abc123 aggregate"]}',
					},
				],
			},
		};

		redactEvent(event);

		expect(event.exception.values[0]?.value).toBe(
			"UpstashError (message withheld)",
		);
		expect(JSON.stringify(event)).not.toContain("user_abc123");
	});

	it("strips control characters so an issue title cannot fake a log line", () => {
		const event = {
			message: "boom\n\r[ERROR] fabricated second line\u0000\u0007",
		};

		const out = redactEvent(event);

		expect(out.message).not.toContain("\n");
		expect(out.message).not.toContain("\u0000");
		expect(out.message).not.toContain("\r");
	});

	it("caps string length", () => {
		const event = { message: "x".repeat(5_000) };
		expect((redactEvent(event).message as string).length).toBeLessThanOrEqual(
			500,
		);
	});

	it("leaves a clean event materially intact", () => {
		const event = {
			message: "trpc_procedure_failed",
			extra: { path: "course.getOwnCourse", userId: "u1" },
		};

		expect(redactEvent(event)).toMatchObject({
			message: "trpc_procedure_failed",
			extra: { path: "course.getOwnCourse", userId: "u1" },
		});
	});

	it("does not spin on a cyclic event", () => {
		const event: Record<string, unknown> = { message: "m" };
		const cycle: Record<string, unknown> = {};
		cycle.self = cycle;
		event.extra = cycle;

		expect(() => redactEvent(event)).not.toThrow();
	});
});
