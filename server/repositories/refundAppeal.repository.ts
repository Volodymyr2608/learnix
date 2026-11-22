import type { Prisma, RefundAppeal } from "@/generated/prisma";
import { NEVER_AUTO } from "@/server/services/refund/appealRules";
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

	/** FR-A1: the open appeals, oldest first, with what the queue shows (never Stripe text). */
	listOpen() {
		return this.db.refundAppeal.findMany({
			where: { status: "open" },
			orderBy: { createdAt: "asc" },
			select: {
				id: true,
				kind: true,
				exceededCondition: true,
				reason: true,
				text: true,
				deadlineAt: true,
				createdAt: true,
				files: {
					where: { deletedAt: null },
					select: { id: true, fileName: true, uploadedBy: true },
				},
				request: {
					select: {
						studentId: true,
						courseId: true,
						paymentId: true,
						snapshot: true,
						student: { select: { name: true } },
						course: { select: { title: true } },
						payment: { select: { disputeState: true, paidAt: true } },
					},
				},
			},
		});
	}

	/** FR-A2: the appeal and the facts a decision re-checks, inside the deciding transaction. */
	findForDecision(tx: Prisma.TransactionClient, appealId: string) {
		return tx.refundAppeal.findUnique({
			where: { id: appealId },
			select: {
				id: true,
				status: true,
				request: {
					select: {
						id: true,
						studentId: true,
						courseId: true,
						paymentId: true,
						payment: { select: { disputeState: true } },
					},
				},
			},
		});
	}

	/** FR-A3: open → decided, exactly once; false when someone else decided first. */
	async closeInTx(
		tx: Prisma.TransactionClient,
		appealId: string,
		data: {
			status: "approved" | "denied" | "overdue_approved";
			decidedBy: string | null;
			decidedAt: Date;
			denialReason?: string;
		},
	): Promise<boolean> {
		const { count } = await tx.refundAppeal.updateMany({
			where: { id: appealId, status: "open" },
			data,
		});
		return count === 1;
	}

	/** V16: what the student's decision email needs. */
	findForDecisionEmail(appealId: string) {
		return this.db.refundAppeal.findUnique({
			where: { id: appealId },
			select: {
				id: true,
				status: true,
				denialReason: true,
				request: {
					select: {
						student: { select: { id: true, email: true, name: true } },
						course: { select: { title: true } },
						payment: { select: { amountCents: true, currency: true } },
					},
				},
			},
		});
	}

	/** Review I2 pattern: decided appeals since `since` whose student email has no log row. */
	findUnnotifiedDecisions(since: Date, limit: number) {
		return this.db.$queryRaw<{ id: string }[]>`
			SELECT a.id
			  FROM refund_appeals a
			  JOIN refund_requests r ON r.id = a.request_id
			 WHERE a.status <> 'open'
			   AND a.decided_at >= ${since}::timestamp
			   AND NOT EXISTS (SELECT 1 FROM notification_logs n
			                    WHERE n."dedupKey" = r.student_id || ':appeal_decided:' || a.id)
			 ORDER BY a.decided_at
			 LIMIT ${limit}`;
	}

	/**
	 * V11 / audit L-1: open after-denial appeals whose window has ended and whose denial failed
	 * neither the threshold nor the account limit — the only ones the day-14 rule can approve, so
	 * undecided direct appeals never crowd them out of the batch.
	 */
	findOverdueCandidates(windowEndedBefore: Date, limit: number) {
		return this.db.refundAppeal.findMany({
			where: {
				status: "open",
				kind: "after_denial",
				exceededCondition: { notIn: [...NEVER_AUTO] },
				request: {
					payment: { paidAt: { lte: windowEndedBefore } },
					NOT: {
						failedConditions: { hasSome: [...NEVER_AUTO] },
					},
				},
			},
			orderBy: { createdAt: "asc" },
			take: limit,
			select: {
				id: true,
				kind: true,
				status: true,
				exceededCondition: true,
				request: {
					select: {
						id: true,
						paymentId: true,
						studentId: true,
						courseId: true,
						failedConditions: true,
						payment: { select: { paidAt: true, disputeState: true } },
					},
				},
			},
		});
	}

	/** V11, V12: every open appeal with what the day-14 rule and the reminders read. */
	findOpenForJobs(limit: number) {
		return this.db.refundAppeal.findMany({
			where: { status: "open" },
			orderBy: { createdAt: "asc" },
			take: limit,
			select: {
				id: true,
				kind: true,
				status: true,
				exceededCondition: true,
				deadlineAt: true,
				request: {
					select: {
						id: true,
						paymentId: true,
						course: { select: { title: true } },
						payment: { select: { paidAt: true } },
					},
				},
			},
		});
	}

	/** FR-P22 (W10): files of appeals decided on or before `decidedBefore`, not yet deleted. */
	findExpiredEvidence(decidedBefore: Date, limit: number) {
		return this.db.refundEvidenceFile.findMany({
			where: {
				deletedAt: null,
				appeal: { status: { not: "open" }, decidedAt: { lte: decidedBefore } },
			},
			orderBy: { createdAt: "asc" },
			take: limit,
			select: { id: true, blobPathname: true },
		});
	}

	/** FR-P23 (W11): the student's evidence files not yet deleted, read before anonymisation. */
	findEvidenceOfStudent(studentId: string) {
		return this.db.refundEvidenceFile.findMany({
			where: { deletedAt: null, appeal: { request: { studentId } } },
			select: { id: true, blobPathname: true },
		});
	}

	/** EC-12 (W12): the course titles of the student's open appeals. */
	async findOpenAppealCourseTitles(studentId: string): Promise<string[]> {
		const rows = await this.db.refundAppeal.findMany({
			where: { status: "open", request: { studentId } },
			orderBy: { createdAt: "asc" },
			select: { request: { select: { course: { select: { title: true } } } } },
		});
		return rows.map((r) => r.request.course.title);
	}

	markEvidenceDeleted(fileIds: string[], now: Date) {
		return this.db.refundEvidenceFile.updateMany({
			where: { id: { in: fileIds }, deletedAt: null },
			data: { deletedAt: now },
		});
	}

	/** V12: what the admin notices name — the course and the deadline; never the student's text. */
	findForAdminNotice(appealId: string) {
		return this.db.refundAppeal.findUnique({
			where: { id: appealId },
			select: {
				id: true,
				kind: true,
				deadlineAt: true,
				request: {
					select: {
						course: { select: { title: true } },
						payment: { select: { paidAt: true } },
					},
				},
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
