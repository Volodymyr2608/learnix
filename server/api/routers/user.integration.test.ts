// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import { afterEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { createCallerFactory } from "@/server/api/trpc";
import { testDb, truncateAll } from "@/test/db";
import { makeUser } from "@/test/factories";
import { userRouter } from "./user";

const createCaller = createCallerFactory(userRouter);

function ctxForUser(userId: string, role: Role = Role.STUDENT) {
	return {
		db: testDb,
		headers: new Headers(),
		session: { user: { id: userId, role }, session: { id: "s1" } },
	} as never;
}

function anonCtx() {
	return {
		db: testDb,
		headers: new Headers(),
		session: null,
	} as never;
}

afterEach(() => truncateAll());

describe("user.updateProfile", () => {
	it("updates name for the authenticated user", async () => {
		const user = await makeUser({ role: Role.STUDENT });
		const caller = createCaller(ctxForUser(user.id));

		await caller.updateProfile({ name: "New Name", image: null });

		const updated = await testDb.user.findUnique({ where: { id: user.id } });
		expect(updated?.name).toBe("New Name");
	});

	it("rejects anonymous callers with UNAUTHORIZED", async () => {
		const caller = createCaller(anonCtx());
		await expect(
			caller.updateProfile({ name: "x", image: null }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("user.updateEmailPreferences", () => {
	it("writes emailNotificationsEnabled to the DB", async () => {
		const user = await makeUser({ role: Role.STUDENT });
		const caller = createCaller(ctxForUser(user.id));

		await caller.updateEmailPreferences({ emailNotificationsEnabled: false });

		const updated = await testDb.user.findUnique({ where: { id: user.id } });
		expect(updated?.emailNotificationsEnabled).toBe(false);

		await caller.updateEmailPreferences({ emailNotificationsEnabled: true });
		const toggled = await testDb.user.findUnique({ where: { id: user.id } });
		expect(toggled?.emailNotificationsEnabled).toBe(true);
	});

	it("rejects anonymous callers with UNAUTHORIZED", async () => {
		const caller = createCaller(anonCtx());
		await expect(
			caller.updateEmailPreferences({ emailNotificationsEnabled: false }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
