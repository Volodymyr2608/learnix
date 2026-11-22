import type { Prisma } from "@/generated/prisma";

/**
 * C18 / V4: the refund audit is append-only — this repository can only insert, and a Postgres
 * trigger rejects UPDATE and DELETE. Every write runs inside the transaction of the change it
 * records, so a decision and its audit row exist together or not at all.
 */
export const refundAuditRepository = {
	createInTx: (
		tx: Prisma.TransactionClient,
		data: Prisma.RefundAuditUncheckedCreateInput,
	) => tx.refundAudit.create({ data, select: { id: true } }),
};
