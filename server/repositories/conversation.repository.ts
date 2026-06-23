import type { Conversation, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export type ConversationWithParticipants = {
  id: string;
  studentId: string;
  instructorId: string;
  courseId: string;
  studentName: string;
  instructorName: string;
  courseTitle: string;
};

export type ConversationInboxRow = {
  id: string;
  courseId: string;
  courseTitle: string;
  otherParticipantName: string;
  lastMessagePreview: string;
  lastMessageAt: Date;
  unreadCount: number;
};

export default class ConversationRepository extends BaseRepository<
  "conversation",
  Conversation,
  Prisma.ConversationUncheckedCreateInput,
  Prisma.ConversationUpdateInput,
  Prisma.ConversationWhereInput,
  Prisma.ConversationInclude,
  Prisma.ConversationSelect,
  Prisma.ConversationOrderByWithRelationInput
> {
  protected readonly modelName = "conversation";

  findByTriple(studentId: string, instructorId: string, courseId: string) {
    return this.findFirst({ where: { studentId, instructorId, courseId } });
  }

  async getOrCreate(
    studentId: string,
    instructorId: string,
    courseId: string,
  ): Promise<Conversation> {
    const existing = await this.findByTriple(studentId, instructorId, courseId);
    if (existing) return existing;
    try {
      return await this.createRaw({ studentId, instructorId, courseId });
    } catch (error) {
      // Lost a race against a concurrent first message: re-read the row the
      // @@unique([studentId, instructorId, courseId]) constraint protected.
      const row = await this.findByTriple(studentId, instructorId, courseId);
      if (row) return row;
      throw error;
    }
  }

  async findWithParticipants(
    id: string,
  ): Promise<ConversationWithParticipants | null> {
    const row = await this.model.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        instructorId: true,
        courseId: true,
        student: { select: { name: true } },
        instructor: { select: { name: true } },
        course: { select: { title: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      studentId: row.studentId,
      instructorId: row.instructorId,
      courseId: row.courseId,
      studentName: row.student.name,
      instructorName: row.instructor.name,
      courseTitle: row.course.title,
    };
  }

  async findForUser(userId: string): Promise<ConversationInboxRow[]> {
    const rows = await this.model.findMany({
      where: { OR: [{ studentId: userId }, { instructorId: userId }] },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        studentId: true,
        courseId: true,
        lastMessageAt: true,
        student: { select: { name: true } },
        instructor: { select: { name: true } },
        course: { select: { title: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
        _count: {
          select: {
            messages: { where: { readAt: null, NOT: { senderId: userId } } },
          },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      courseTitle: r.course.title,
      otherParticipantName:
        r.studentId === userId ? r.instructor.name : r.student.name,
      lastMessagePreview: r.messages[0]?.body ?? "",
      lastMessageAt: r.lastMessageAt,
      unreadCount: r._count.messages,
    }));
  }
}

export const conversationRepository = new ConversationRepository();