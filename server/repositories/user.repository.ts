import type { User } from "better-auth";
import type { Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export const ANONYMISED_USER_NAME = "Deleted user";

export const anonymisedEmailFor = (userId: string): string =>
	`deleted-${userId}@system.invalid`;

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
	public async anonymiseAccount(userId: string): Promise<void> {
		await this.db.$transaction(async (tx) => {
			// Credentials — retaining any of these would make the anonymisation reversible.
			await tx.session.deleteMany({ where: { userId } });
			await tx.account.deleteMany({ where: { userId } });

			// Private authored content.
			await tx.lessonAssistantMessage.deleteMany({
				where: { conversation: { studentId: userId } },
			});
			await tx.lessonAssistantConversation.deleteMany({
				where: { studentId: userId },
			});
			await tx.courseGenerationMessage.deleteMany({
				where: { generation: { instructorId: userId } },
			});
			await tx.courseGeneration.deleteMany({ where: { instructorId: userId } });

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
					email: anonymisedEmailFor(userId),
					image: null,
					emailVerified: false,
					emailNotificationsEnabled: false,
					welcomeEmailSentAt: null,
				},
			});
		});
	}
}

export const userRepository = new UserRepository();
