import type { LessonAssistantConversation, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class LessonAssistantConversationRepository extends BaseRepository<
	"lessonAssistantConversation",
	LessonAssistantConversation,
	Prisma.LessonAssistantConversationUncheckedCreateInput,
	Prisma.LessonAssistantConversationUpdateInput,
	Prisma.LessonAssistantConversationWhereInput,
	Prisma.LessonAssistantConversationInclude,
	Prisma.LessonAssistantConversationSelect,
	Prisma.LessonAssistantConversationOrderByWithRelationInput
> {
	protected readonly modelName = "lessonAssistantConversation" as const;

	getOrCreate(lessonId: string, studentId: string) {
		return this.upsert({
			where: { lessonId_studentId: { lessonId, studentId } },
			create: { lessonId, studentId },
			update: {},
		});
	}

	findByLessonAndStudent(lessonId: string, studentId: string) {
		return this.findFirst({ where: { lessonId, studentId } });
	}

	/**
	 * The explicit message field list is the control, not a tidiness choice: see
	 * `lessonAssistantRepository.getMessages`. `toolCalls` must never appear here.
	 */
	findWithMessages(lessonId: string, studentId: string) {
		return this.findFirst({
			where: { lessonId, studentId },
			include: {
				messages: {
					orderBy: { createdAt: "asc" },
					select: {
						id: true,
						role: true,
						content: true,
						createdAt: true,
					},
				},
			},
		});
	}
}

export const lessonAssistantConversationRepository =
	new LessonAssistantConversationRepository();
