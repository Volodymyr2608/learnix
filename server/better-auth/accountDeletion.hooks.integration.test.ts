import { describe, expect, it } from "vitest";
import { auth } from "@/server/better-auth";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";
import {
	anonymiseOnAccountDeletion,
	preventUserRowDeletion,
} from "./accountDeletion.hooks";

describe("preventUserRowDeletion", () => {
	it("returns exactly false so Better Auth skips adapter.delete()", async () => {
		// with-hooks.mjs:104 compares with ===, so a falsy value is not enough.
		await expect(preventUserRowDeletion()).resolves.toBe(false);
	});
});

describe("Better Auth wiring", () => {
	// Without these, deleting either config line leaves every other test in this
	// file passing while account deletion silently reverts to destroying the row.
	it("runs the anonymisation from deleteUser.beforeDelete", () => {
		expect(auth.options.user?.deleteUser?.beforeDelete).toBe(
			anonymiseOnAccountDeletion,
		);
	});

	it("vetoes the user row delete from databaseHooks", () => {
		expect(auth.options.databaseHooks?.user?.delete?.before).toBe(
			preventUserRowDeletion,
		);
	});
});

describe("anonymiseOnAccountDeletion", () => {
	it("anonymises the account before Better Auth touches anything", async () => {
		const user = await makeUser({ name: "Ada Lovelace" });
		await testDb.session.create({
			data: {
				userId: user.id,
				token: "sess-token",
				expiresAt: new Date(Date.now() + 60_000),
			},
		});

		await anonymiseOnAccountDeletion({ id: user.id });

		const after = await testDb.user.findUniqueOrThrow({
			where: { id: user.id },
		});
		expect(after.name).toBe("Deleted user");
		expect(after.email).toMatch(/@system\.invalid$/);
		expect(await testDb.session.count({ where: { userId: user.id } })).toBe(0);
	});

	it("throws — aborting the deletion request — when anonymisation fails", async () => {
		const survivor = await makeUser({ name: "Ada Lovelace" });

		// No such row, so the transaction's final UPDATE raises after the deletes.
		await expect(
			anonymiseOnAccountDeletion({ id: "no-such-user" }),
		).rejects.toThrow();

		const after = await testDb.user.findUniqueOrThrow({
			where: { id: survivor.id },
		});
		expect(after.name).toBe("Ada Lovelace");
	});

	it("does not archive the instructor's courses", async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await anonymiseOnAccountDeletion({ id: instructor.id });

		const after = await testDb.course.findUniqueOrThrow({
			where: { id: course.id },
		});
		expect(after.deletedAt).toBeNull();
		expect(after.status).toBe("published");
	});
});
