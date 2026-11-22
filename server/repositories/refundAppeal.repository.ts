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

	/** V8: the payment's existing request and whether it already has an appeal. */
	findRequestForAppeal(tx: Prisma.TransactionClient, paymentId: string) {
		return tx.refundRequest.findUnique({
			where: { paymentId },
			select: {
				id: true,
				decision: true,
				failedConditions: true,
				createdAt: true,
				appeal: { select: { id: true } },
			},
		});
	}

	createRequestInTx(
		tx: Prisma.TransactionClient,
		data: Prisma.RefundRequestUncheckedCreateInput,
	) {
		return tx.refundRequest.create({ data, select: { id: true } });
	}

	createAppealInTx(
		tx: Prisma.TransactionClient,
		data: Prisma.RefundAppealUncheckedCreateInput,
	) {
		return tx.refundAppeal.create({ data, select: { id: true } });
	}

	createFilesInTx(
		tx: Prisma.TransactionClient,
		files: Prisma.RefundEvidenceFileCreateManyInput[],
	) {
		return files.length === 0
			? Promise.resolve({ count: 0 })
			: tx.refundEvidenceFile.createMany({ data: files });
	}

	/** V12: what the admin notices name — the course and the deadline; never the student's text. */
	findForAdminNotice(appealId: string) {
		return this.db.refundAppeal.findUnique({
			where: { id: appealId },
			select: {
				id: true,
				kind: true,
				deadlineAt: true,
				request: { select: { course: { select: { title: true } } } },
			},
		});
	}

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
