import { describe, expect, it, vi } from "vitest";

const { captureException, setTag, setContext } = vi.hoisted(() => ({
	captureException: vi.fn(),
	setTag: vi.fn(),
	setContext: vi.fn(),
}));

const scope = { setTag, setContext, ctx: {} as Record<string, unknown> };

vi.mock("@sentry/nextjs", async (importOriginal) => ({
	...(await importOriginal<object>()),
	captureException,
	getIsolationScope: () => scope,
}));

const { reportError } = await import("./reportError");
const { handleServiceError } = await import(
	"@/server/utils/handleServiceError"
);
const { DomainError } = await import("@/server/services/base/base.errors");

class InstructorError extends DomainError {}

const PASSWORD = "hunter2-supersecret";
const EMAIL = "victim@example.com";

/**
 * End-to-end regression for the leak `enrichScope` had when it dropped its allowlist:
 * a DTO passed as `DomainError`'s 4th argument reached `setContext`, and the isolation
 * scope merges into the next `captureException`.
 *
 * The fixture is the live path, not a hypothetical. `instructor.create` is a
 * `publicProcedure`; after the email-uniqueness check it runs a transaction
 * (`userService.setRole`, then `instructorRepository.create`), and any failure there
 * lands in the catch at `instructor.service.ts:79-87`, which passes `{ dto }` — the
 * whole `instructorSchema` input, plaintext password and email included.
 */
describe("a DomainError carrying a DTO, reported end to end", () => {
	it("transmits neither the password, the email, nor the name", () => {
		// instructor.service.ts:81-86, verbatim shape.
		const dto = {
			fullName: "Ada",
			email: EMAIL,
			password: PASSWORD,
			expertise: "x",
			experience: "y",
			bio: "z",
			courseIdea: "i",
		};
		const dbFailure = new Error("P2028 transaction timeout");
		const domain = new InstructorError(
			"Failed to create instructor",
			"INTERNAL_SERVER_ERROR",
			dbFailure,
			{ dto },
		);

		let thrown: unknown;
		try {
			handleServiceError(domain);
		} catch (e) {
			thrown = e;
		}

		// timingMiddleware then captures the TRPCError.
		reportError(thrown, "trpc_procedure_failed", { path: "instructor.create" });

		const everything = JSON.stringify({
			setContext: setContext.mock.calls,
			setTag: setTag.mock.calls,
			capture: captureException.mock.calls.map(([root, opts]) => {
				const chain: unknown[] = [];
				let cursor: unknown = root;
				while (cursor instanceof Error) {
					chain.push({
						name: cursor.name,
						message: cursor.message,
						...(cursor as unknown as Record<string, unknown>),
					});
					cursor = (cursor as { cause?: unknown }).cause;
				}
				return { chain, opts };
			}),
		});

		expect(captureException).toHaveBeenCalledTimes(1);
		expect(everything).not.toContain(PASSWORD);
		expect(everything).not.toContain(EMAIL);
		expect(everything).not.toContain("Ada");
		expect(setContext).not.toHaveBeenCalled();
	});
});
