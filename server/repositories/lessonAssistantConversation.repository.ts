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

	findWithMessages(lessonId: string, studentId: string) {
		return this.findFirst({
			where: { lessonId, studentId },
			include: { messages: { orderBy: { createdAt: "asc" } } },
		});
	}
}

export const lessonAssistantConversationRepository =
	new LessonAssistantConversationRepository();
