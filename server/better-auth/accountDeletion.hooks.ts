import { userService } from "@/server/services/user/user.service";

/**
 * Better Auth's `user.deleteUser.beforeDelete` hook.
 *
 * Runs at node_modules/better-auth/dist/api/routes/update-user.mjs:365-366,
 * immediately BEFORE `internalAdapter.deleteUser`. Two properties matter:
 *
 *  - It runs before Better Auth deletes the user's sessions and accounts
 *    (internal-adapter.mjs:129-136), so our transaction owns the whole operation
 *    and a failure leaves the account fully intact and still able to sign in.
 *  - Throwing here propagates out of the route handler, so nothing is deleted.
 *
 * It canNOT stop the row delete — that is `preventUserRowDeletion`'s job.
 */
export const anonymiseOnAccountDeletion = async (user: {
	id: string;
}): Promise<void> => {
	await userService.anonymiseAccount(user.id);
};

/**
 * Better Auth's `databaseHooks.user.delete.before` hook — the veto.
 *
 * `deleteWithHooks` (dist/db/with-hooks.mjs:101-108) compares the returned value
 * with `=== false` and returns early, so `adapter.delete({ model: "user" })` never
 * runs. It must return the literal `false`; `undefined` lets the delete proceed.
 *
 * This is unconditional on purpose: no code path may ever remove a `User` row,
 * because 20 relations and four unique constraints depend on it.
 */
export const preventUserRowDeletion = async (): Promise<false> => false;
