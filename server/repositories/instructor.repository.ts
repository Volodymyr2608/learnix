import type { InstructorProfile, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class InstructorRepository extends BaseRepository<
	"instructorProfile",
	InstructorProfile,
	Prisma.InstructorProfileUncheckedCreateInput,
	Prisma.InstructorProfileUpdateInput,
	Prisma.InstructorProfileWhereInput,
	Prisma.InstructorProfileInclude,
	Prisma.InstructorProfileSelect,
	Prisma.InstructorProfileOrderByWithRelationInput
> {
	protected readonly modelName = "instructorProfile" as const;

	async getReviewsLastViewedAt(userId: string): Promise<Date | null> {
		const profile = await this.model.findUnique({
			where: { userId },
			select: { reviewsLastViewedAt: true },
		});
		return profile?.reviewsLastViewedAt ?? null;
	}

	async touchReviewsViewed(userId: string): Promise<void> {
		await this.model.update({
			where: { userId },
			data: { reviewsLastViewedAt: new Date() },
		});
	}
}

export const instructorRepository = new InstructorRepository();
