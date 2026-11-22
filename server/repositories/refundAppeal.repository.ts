import type { Prisma, RefundAppeal } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

class RefundAppealRepository extends BaseRepository<
	"refundAppeal",
	RefundAppeal,
	Prisma.RefundAppealUncheckedCreateInput,
	Prisma.RefundAppealUpdateInput,
	Prisma.RefundAppealWhereInput,
	Prisma.RefundAppealInclude,
	Prisma.RefundAppealSelect,
	Prisma.RefundAppealOrderByWithRelationInput
> {
	protected readonly modelName = "refundAppeal" as const;

	/**
	 * C20 / V7: an evidence file, found only if the viewer may see it — the payment's student, or an
	 * admin — in one query. Anyone else gets null, the same as a missing file.
	 */
	findFileForViewer(fileId: string, viewer: { id: string; isAdmin: boolean }) {
		return this.db.refundEvidenceFile.findFirst({
			where: {
				id: fileId,
				deletedAt: null,
				...(viewer.isAdmin
					? {}
					: { appeal: { request: { studentId: viewer.id } } }),
			},
			select: { blobPathname: true, fileName: true, contentType: true },
		});
	}
}

export const refundAppealRepository = new RefundAppealRepository();
