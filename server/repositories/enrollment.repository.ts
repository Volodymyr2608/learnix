import type { Enrollment, Prisma } from "@/generated/prisma";
import { EnrollmentStatus } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

class EnrollmentRepository extends BaseRepository<
  "enrollment",
  Enrollment,
  Prisma.EnrollmentUncheckedCreateInput,
  Prisma.EnrollmentUpdateInput,
  Prisma.EnrollmentWhereInput,
  Prisma.EnrollmentInclude,
  Prisma.EnrollmentSelect,
  Prisma.EnrollmentOrderByWithRelationInput
> {
  protected readonly modelName = "enrollment" as const;

  async findEnrolledCourseIds(userId: string): Promise<string[]> {
    const rows = await this.findMany({
      where: {
        studentId: userId,
        status: { in: [EnrollmentStatus.active, EnrollmentStatus.completed] },
      },
      select: { courseId: true },
    });
    return rows.map((r) => (r as { courseId: string }).courseId);
  }

  findByStudentCourse(studentId: string, courseId: string) {
    return this.findFirst({
      where: { studentId, courseId, status: { not: EnrollmentStatus.cancelled } },
      include: { course: { select: { deletedAt: true, status: true } } },
    });
  }
}

export const enrollmentRepository = new EnrollmentRepository();