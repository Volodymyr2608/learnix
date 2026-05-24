// Set NODE_ENV to production before importing tRPC so the timing middleware
// (which adds 100–400 ms artificial delay when isDev=true) is skipped.
process.env.NODE_ENV = "production";

import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import {
	adminProcedure,
	createCallerFactory,
	createTRPCRouter,
	instructorProcedure,
	studentProcedure,
} from "@/server/api/trpc";
import { testDb } from "@/test/db";

const testRouter = createTRPCRouter({
	studentOnly: studentProcedure.query(() => "student-ok"),
	instructorOnly: instructorProcedure.query(() => "instructor-ok"),
	adminOnly: adminProcedure.query(() => "admin-ok"),
});

const createCaller = createCallerFactory(testRouter);

function ctxForRole(role: Role | null) {
	return {
		db: testDb,
		headers: new Headers(),
		session: role ? { user: { id: "u1", role }, session: { id: "s1" } } : null,
	} as never;
}

describe("role-gated procedures", () => {
	it("allows the matching role and returns the value", async () => {
		const caller = createCaller(ctxForRole(Role.STUDENT));
		await expect(caller.studentOnly()).resolves.toBe("student-ok");
	});

	it("rejects a mismatched role with FORBIDDEN", async () => {
		const caller = createCaller(ctxForRole(Role.STUDENT));
		await expect(caller.instructorOnly()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	it("rejects an unauthenticated caller with UNAUTHORIZED", async () => {
		const caller = createCaller(ctxForRole(null));
		await expect(caller.adminOnly()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
