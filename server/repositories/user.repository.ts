import { randomUUID } from "node:crypto";
import type { User } from "better-auth";
import type { Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export const ANONYMISED_USER_NAME = "Deleted user";

/**
 * Reserved, non-deliverable domain. `.invalid` is reserved by RFC 2606 and can
 * never resolve, which is load-bearing: better-auth's password-reset flow would
 * otherwise re-create a credential account for any address that can receive
 * mail. Do not move this to a domain we actually own.
 */
export const ANONYMISED_EMAIL_DOMAIN = "@system.invalid";

/**
 * Builds the placeholder address that replaces a deleted account's email.
 *
 * Deliberately random rather than derived from the user's id. A derived address
 * would be a pre-image: `Message.senderId` hands a counterparty the raw `userId`
 * (server/services/messaging/messaging.service.ts:102), so anyone who had ever
 * been messaged could register an ordinary account at the victim's future
 * placeholder address and permanently block their deletion on the `users.email`
 * unique constraint. It also keeps the retained row from carrying the original
 * id as a correlation handle.
 */
export const anonymisedEmailFor = (): string =>
	`deleted-${randomUUID()}${ANONYMISED_EMAIL_DOMAIN}`;

/**
 * Prisma filter that excludes anonymised accounts.
 *
 * Anonymised users keep their `Enrollment`, `Payment` and progress rows, so any
 * query that selects users *by their retained data* will match them. Batch jobs
 * that rebuild per-user derived data must exclude them, or they resurrect
 * exactly what `anonymiseAccount` destroyed — see scripts/reindex-embeddings.ts.
 */
export const NOT_ANONYMISED: Prisma.UserWhereInput = {
	email: { not: { endsWith: ANONYMISED_EMAIL_DOMAIN } },
};

export default class UserRepository extends BaseRepository<
	"user",
	User,
	Prisma.UserCreateInput,
	Prisma.UserUpdateInput,
	Prisma.UserWhereInput,
	Prisma.UserInclude,
	Prisma.UserSelect,
	Prisma.UserOrderByWithRelationInput
> {
	protected readonly modelName = "user" as const;

	/**
	 * Irreversibly anonymises an account in place.
	 *
	 * The `User` row is deliberately retained: every foreign key and four unique
	 * constraints depend on it, so removing it would cascade into other people's
	 * courses, payments, reviews and conversations. See
	 * docs/specs/features/account-deletion-data-retention/spec.md.
	 *
	 * Every statement runs through `tx`. Do not refactor this onto
	 * `BaseRepository.transaction` — its existing call sites issue writes through
	 * repository singletons that hold `db`, not `tx`, so they are not atomic.
	 */
	public async anonymiseAccount(
		userId: string,
		/** Overridable only so tests can force a unique-constraint collision. */
		anonymisedEmail: string = anonymisedEmailFor(),
	): Promise<void> {
		await this.db.$transaction(
			async (tx) => {
				// Credentials — retaining any of these would make the anonymisation reversible.
				await tx.session.deleteMany({ where: { userId } });
				await tx.account.deleteMany({ where: { userId } });
				// Pending password-reset / verification tokens are credentials too: a live
				// token outliving the account is a path back into it.
				await tx.verification.deleteMany({ where: { value: userId } });

				// Private authored content. The two message deletes are redundant with the
				// `Cascade` on their parent — they are kept deliberately so that a future
				// downgrade of either cascade cannot silently strand the transcripts.
				// Model-authored questions about this student, with their answer keys.
				// The FK cascade is defence in depth and NOT the control: ADR-025 never
				// deletes the `User` row (`databaseHooks.user.delete.before` returns
				// false), so `onDelete` never fires on this path. `ConceptCheck` is in
				// the destroyed class, like the assistant transcripts, which is why the
				// relation is declared `Cascade` — but the delete below is what
				// actually runs.
				await tx.conceptCheck.deleteMany({ where: { studentId: userId } });

				// The two archive tables the mastery migrations wrote. They hold this
				// student's educational record — studentId, courseId, concept, level —
				// but they are not in `prisma/schema`, carry no foreign key, and are
				// therefore reached by nothing else: no cascade, no Restrict, no
				// Prisma model. Without these two statements an erased account leaves
				// its mastery history behind in tables nobody is looking at.
				//
				// These lines are deleted together with the tables, on the dated drop
				// recorded in account-deletion-data-retention/spec.md.
				await tx.$executeRaw`
				DELETE FROM "concept_mastery_archive_merge" WHERE "studentId" = ${userId}
			`;
				await tx.$executeRaw`
				DELETE FROM "concept_mastery_archive_le2" WHERE "studentId" = ${userId}
			`;

				await tx.lessonAssistantMessage.deleteMany({
					where: { conversation: { studentId: userId } },
				});
				await tx.lessonAssistantConversation.deleteMany({
					where: { studentId: userId },
				});
				await tx.courseGenerationMessage.deleteMany({
					where: { generation: { instructorId: userId } },
				});
				await tx.courseGeneration.deleteMany({
					where: { instructorId: userId },
				});

				// Derived behavioural profiles and personal addressing.
				// `user_interest_embeddings` carries an Unsupported("vector(1536)") column;
				// every mutation on it in this codebase goes through raw SQL
				// (server/repositories/embedding.repository.ts:48).
				await tx.$executeRaw`
				DELETE FROM user_interest_embeddings WHERE "userId" = ${userId}
			`;
				await tx.learningPathCache.deleteMany({ where: { studentId: userId } });
				await tx.notificationLog.deleteMany({ where: { userId } });

				// The instructor profile is scrubbed rather than destroyed: it carries
				// `stripeAccountId`, which the payout sweep needs to pay out money already
				// owed (server/services/payments/connect.service.ts:119-128). Only the
				// authored free text is removed.
				await tx.instructorProfile.updateMany({
					where: { userId },
					data: {
						professionalBio: "",
						courseIdea: "",
						teachingExperience: "",
						areaOfExpertise: "",
						phone: null,
						linkedinUrl: null,
						websiteUrl: null,
					},
				});

				await tx.user.update({
					where: { id: userId },
					data: {
						name: ANONYMISED_USER_NAME,
						email: anonymisedEmail,
						image: null,
						emailVerified: false,
						emailNotificationsEnabled: false,
						welcomeEmailSentAt: null,
					},
				});
			},
			// Prisma's defaults are maxWait 2s / timeout 5s (server/db.ts sets no
			// transactionOptions). A long-lived instructor can hold a large AI
			// transcript and thousands of notification logs; exceeding the default
			// budget raises P2028 and rolls back, leaving the account undeletable on
			// every retry.
			{ timeout: 30_000, maxWait: 10_000 },
		);
	}
}

export const userRepository = new UserRepository();
