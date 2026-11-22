import { type Payment, Prisma } from "@/generated/prisma";
import {
	APPEAL_GRACE_MS,
	CHECKOUT_MAX_MS,
	RELEASE_GRACE_MS,
} from "@/server/services/payments/payoutRules";
import { REFUND_WINDOW_MS } from "@/server/services/refund/refundRules";
import { BaseRepository } from "./base/base.repository";

const ms = (value: number) =>
	Prisma.sql`(interval '1 millisecond' * ${value}::float8)`;

/** H1: the window starts at paidAt, or at checkout creation + 24 h when paidAt is unknown. */
const windowStart = Prisma.sql`COALESCE(p.paid_at, p.created_at + ${ms(CHECKOUT_MAX_MS)})`;

/**
 * FR-P2a / ADR-037 §1 — the one release predicate, as SQL over `payments p`. Every path that
 * claims or selects a payment for release uses this fragment, so they cannot drift apart:
 * succeeded and not refunded; the window closed + 1 h (C5); no approved request still waiting
 * for its refund (H2); no denied request whose appeal deadline has not passed (H3, FR-S16).
 */
const eligible = (now: Date) => Prisma.sql`
	p.status = 'succeeded'
	AND p.refunded_at IS NULL
	AND ${now}::timestamp >= ${windowStart} + ${ms(REFUND_WINDOW_MS + RELEASE_GRACE_MS)}
	AND NOT EXISTS (
		SELECT 1 FROM refund_requests r
		WHERE r.payment_id = p.id
		  AND (
			r.decision = 'auto_approved'
			OR (
				r.decision = 'auto_denied'
				AND ${now}::timestamp < GREATEST(
					${windowStart} + ${ms(REFUND_WINDOW_MS)},
					r.created_at + ${ms(APPEAL_GRACE_MS)}
				)
			)
		  )
	)`;

class PayoutRepository extends BaseRepository<
	"payment",
	Payment,
	Prisma.PaymentUncheckedCreateInput,
	Prisma.PaymentUpdateInput,
	Prisma.PaymentWhereInput,
	Prisma.PaymentInclude,
	Prisma.PaymentSelect,
	Prisma.PaymentOrderByWithRelationInput
> {
	protected readonly modelName = "payment" as const;

	/**
	 * C5, FR-P4: `pending → transferring` in one conditional update carrying the whole predicate.
	 * Returns true only for the caller whose update changed the row; that caller owns the transfer.
	 */
	async claimForRelease(paymentId: string, now: Date): Promise<boolean> {
		const changed = await this.db.$executeRaw`
			UPDATE payments p
			   SET transfer_status = 'transferring', updated_at = ${now}::timestamp
			 WHERE p.id = ${paymentId}
			   AND p.transfer_status = 'pending'
			   AND ${eligible(now)}`;
		return changed === 1;
	}

	/** FR-P3: eligible `pending` payments plus every stuck `transferring` one, oldest first. */
	async findReleaseCandidates(now: Date, limit: number): Promise<Payment[]> {
		const rows = await this.db.$queryRaw<{ id: string }[]>`
			SELECT p.id FROM payments p
			 WHERE p.transfer_status = 'transferring'
			    OR (p.transfer_status = 'pending' AND ${eligible(now)})
			 ORDER BY ${windowStart} ASC, p.id ASC
			 LIMIT ${limit}`;
		if (rows.length === 0) return [];
		const payments = await this.db.payment.findMany({
			where: { id: { in: rows.map((r) => r.id) } },
		});
		const byId = new Map(payments.map((p) => [p.id, p]));
		return rows.flatMap((r) => byId.get(r.id) ?? []);
	}

	/** account.updated: the instructor's held sales; the claim decides which may go. */
	findPendingForInstructor(instructorId: string): Promise<Payment[]> {
		return this.db.payment.findMany({
			where: { instructorId, transferStatus: "pending" },
			orderBy: { createdAt: "asc" },
		});
	}

	/** ADR-037 §2: `transferring → transferred`; false if another process already finished it. */
	async markTransferred(
		paymentId: string,
		stripeTransferId: string,
		now: Date,
	): Promise<boolean> {
		const { count } = await this.db.payment.updateMany({
			where: { id: paymentId, transferStatus: "transferring" },
			data: {
				transferStatus: "transferred",
				stripeTransferId,
				transferredAt: now,
			},
		});
		return count === 1;
	}

	/** `transferring → pending` when a live check says "not now" (H4, waiting for Stripe). */
	async releaseClaim(paymentId: string): Promise<boolean> {
		const { count } = await this.db.payment.updateMany({
			where: { id: paymentId, transferStatus: "transferring" },
			data: { transferStatus: "pending" },
		});
		return count === 1;
	}
}

export const payoutRepository = new PayoutRepository();
