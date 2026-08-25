// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instructorRouter } from "@/server/api/routers/instructor";
import { userRouter } from "@/server/api/routers/user";
import { createCallerFactory } from "@/server/api/trpc";
import { fingerprintKeyOf } from "@/server/observability/fingerprint";
import {
	createThrottle,
	SENTRY_MAX_PER_FINGERPRINT,
} from "@/server/observability/throttle";
import { AuthError } from "@/server/services/auth/auth.errors";
import { authService } from "@/server/services/auth/auth.service";
import { testDb, truncateAll } from "@/test/db";

const { captureException, setTag, setContext } = vi.hoisted(() => ({
	captureException: vi.fn(),
	setTag: vi.fn(),
	setContext: vi.fn(),
}));

vi.mock("@sentry/nextjs", async (importOriginal) => ({
	...(await importOriginal<object>()),
	captureException,
	getIsolationScope: () => ({ setTag, setContext }),
}));

// instructor.create fires a fire-and-forget welcome email after creation succeeds
// (instructor.service.ts). It is unrelated to what AC 26/27 assert and the test
// env's stub Resend key makes it fail every time, which would otherwise report an
// unrelated error to Sentry through the logger.error -> reportError chokepoint
// (logger.ts) and race with this file's "zero events" assertions.
vi.mock("@/server/services/email/email.service", async (importOriginal) => {
	const actual = await importOriginal<object>();
	return {
		...actual,
		emailService: { send: vi.fn().mockResolvedValue(undefined) },
	};
});

const createUserCaller = createCallerFactory(userRouter);
const createInstructorCaller = createCallerFactory(instructorRouter);

const ctx = { db: testDb, headers: new Headers(), session: null } as never;

const validSignUp = () => ({
	email: `dup-${crypto.randomUUID()}@example.com`,
	name: "Dup User",
	password: "Sup3rSecretPass!",
});

const validInstructor = (email: string) => ({
	fullName: "Dup Instructor",
	email,
	password: "Sup3rSecretPass!",
	phone: "",
	expertise: "Web Development",
	experience: "5+ years",
	bio: "A".repeat(60),
	courseIdea: "A course idea that is definitely long enough.",
	linkedIn: "",
	website: "",
});

beforeEach(() => {
	captureException.mockClear();
});

afterEach(() => truncateAll());

describe("AC 26: duplicate-email signup maps to CONFLICT with zero Sentry events", () => {
	it("user.signUp: second call with the same email throws CONFLICT and reports nothing", async () => {
		const input = validSignUp();
		const caller = createUserCaller(ctx);

		await caller.signUp(input);
		captureException.mockClear();

		await expect(caller.signUp(input)).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(captureException).not.toHaveBeenCalled();
	});

	it("instructor.create: second call with the same email throws CONFLICT and reports nothing", async () => {
		const email = `dup-${crypto.randomUUID()}@example.com`;
		const caller = createInstructorCaller(ctx);

		await caller.create(validInstructor(email));
		captureException.mockClear();

		await expect(caller.create(validInstructor(email))).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(captureException).not.toHaveBeenCalled();
	});
});

describe("AC 27: throttle backstops the publicProcedure signup path even if AC 26 regresses", () => {
	it("1,000 anonymous signup collisions produce at most SENTRY_MAX_PER_FINGERPRINT delivered events", async () => {
		// Faithful-but-fast: the "regression" AC 27 defends against is AC 26's mapping
		// being undone, i.e. AuthError going back to throwing with no code (defaulting
		// to INTERNAL_SERVER_ERROR, which shouldReport.ts does NOT filter). We simulate
		// that regressed state by stubbing authService.signUp directly, rather than
		// hammering real Postgres 1,000 times for a duplicate-key check the service
		// layer already performs with a single findFirst — the throttle logic under
		// test lives entirely downstream of the thrown error, in the tRPC timing
		// middleware -> handleServiceError -> shouldReport -> reportError chain, all of
		// which this still exercises for real through the actual publicProcedure path.
		const signUpSpy = vi
			.spyOn(authService, "signUp")
			.mockRejectedValue(new AuthError("This email is already registered"));

		// Sentry.captureException is mocked wholesale (see top-of-file vi.mock), which
		// means the real SDK's beforeSend — where the throttle is actually wired, see
		// sentry.server.config.ts — never runs. So this test wires the SAME production
		// throttle.createThrottle + fingerprint.fingerprintKeyOf functions into the
		// mock, mirroring beforeSend's own two lines, to decide how many of the 1,000
		// attempted captures would actually have been delivered (i.e. counted against
		// quota) rather than dropped.
		const localThrottle = createThrottle();
		const delivered: unknown[] = [];
		captureException.mockImplementation((_error, options) => {
			const key = fingerprintKeyOf({
				fingerprint: (options as { fingerprint?: string[] } | undefined)
					?.fingerprint,
			});
			if (!localThrottle.shouldThrottle(key)) delivered.push(options);
		});

		const caller = createUserCaller(ctx);
		await Promise.all(
			Array.from({ length: 1_000 }, () =>
				caller.signUp(validSignUp()).catch(() => undefined),
			),
		);

		// Sanity: the regression really did make every one of the 1,000 calls a
		// reportable error (all 1,000 reached the mocked Sentry.captureException).
		expect(captureException).toHaveBeenCalledTimes(1_000);
		// The throttle bounds what actually counts as an event to the budget.
		expect(delivered.length).toBeGreaterThan(0);
		expect(delivered.length).toBeLessThanOrEqual(SENTRY_MAX_PER_FINGERPRINT);

		signUpSpy.mockRestore();
	});
});
