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
 * for its refund (H2); no denied request whose appeal deadline has not passed (H3, FR-S16); no open
 * appeal (V10).
 */
const eligible = (now: Date) => Prisma.sql`
	p.status = 'succeeded'
	AND p.refunded_at IS NULL
	-- W5 / FR-P27: a refund that failed at the bank holds the share until an admin closes it.
	AND p.bank_failure_at IS NULL
	AND (p.dispute_state IS NULL OR p.dispute_state = 'won')
	AND ${now}::timestamp >= ${windowStart} + ${ms(REFUND_WINDOW_MS + RELEASE_GRACE_MS)}
	AND NOT EXISTS (
		SELECT 1 FROM refund_requests r
		WHERE r.payment_id = p.id
		  AND (
			-- V1/V2: an approved request (automatic, appeal, overdue) waiting for or past its refund.
			r.approval IS NOT NULL
			-- V10: an appeal the admin has not decided holds the share (A3, FR-A5).
			OR EXISTS (
				SELECT 1 FROM refund_appeals a
				WHERE a.request_id = r.id AND a.status = 'open'
			)
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

	/**
	 * FR-P3: eligible `pending` payments plus every stuck `transferring` one.
	 * Review #1 — a batch must always make progress:
	 *   - a `pending` sale whose instructor cannot be paid (no account, payouts off by the last
	 *     account.updated) is not a candidate; account.updated releases it when that changes;
	 *   - rows are taken least recently touched first, so a payment that bounced (charge refunded or
	 *     disputed, payouts switched off, a Stripe error) goes behind fresh ones instead of heading
	 *     every batch.
	 */
	async findReleaseCandidates(now: Date, limit: number): Promise<Payment[]> {
		const rows = await this.db.$queryRaw<{ id: string }[]>`
			SELECT p.id FROM payments p
			 WHERE p.transfer_status = 'transferring'
			    OR (p.transfer_status = 'pending'
			        AND EXISTS (SELECT 1 FROM instructor_profiles ip
			                     WHERE ip."userId" = p."instructorId"
			                       AND ip.stripe_account_id IS NOT NULL
			                       AND ip.stripe_payouts_enabled = true)
			        AND ${eligible(now)})
			 ORDER BY p.updated_at ASC, p.id ASC
			 LIMIT ${limit}`;
		if (rows.length === 0) return [];
		const payments = await this.db.payment.findMany({
			where: { id: { in: rows.map((r) => r.id) } },
		});
		const byId = new Map(payments.map((p) => [p.id, p]));
		return rows.flatMap((r) => byId.get(r.id) ?? []);
	}

	findPayment(paymentId: string): Promise<Payment | null> {
		return this.db.payment.findUnique({ where: { id: paymentId } });
	}

	/** M9: held sales — what the panel sums. */
	findHeld() {
		return this.db.payment.findMany({
			where: { status: "succeeded", transferStatus: "pending" },
			select: {
				id: true,
				instructorNetCents: true,
				paidAt: true,
				createdAt: true,
			},
		});
	}

	/** M8: transfers left `transferring` longer than one run could take. */
	findStuckTransferring(before: Date) {
		return this.db.payment.findMany({
			where: { transferStatus: "transferring", updatedAt: { lte: before } },
			select: { id: true, instructorNetCents: true, updatedAt: true },
			orderBy: { updatedAt: "asc" },
		});
	}

	/** M3: is any instructor money held at all (a never-run job matters only then)? */
	async countHeld(): Promise<number> {
		return this.db.payment.count({
			where: { status: "succeeded", transferStatus: "pending" },
		});
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

	/**
	 * C5 remainder: has a refund's compare-and-set flipped this payment — by a path whose share is
	 * reversed? After a lost dispute the platform bears the chargeback (DL), so no reversal.
	 */
	async needsReversal(paymentId: string): Promise<boolean> {
		const row = await this.db.payment.findUnique({
			where: { id: paymentId },
			select: { status: true, refundSource: true },
		});
		return row?.status === "refunded" && row.refundSource !== "lost_dispute";
	}

	/** FR-P7 retry: refunded payments whose released share was not reversed yet. */
	findRefundedTransferred(limit: number): Promise<Payment[]> {
		return this.db.payment.findMany({
			where: {
				status: "refunded",
				transferStatus: "transferred",
				// DL: a share released before a lost dispute is never reversed.
				OR: [{ refundSource: null }, { refundSource: { not: "lost_dispute" } }],
			},
			orderBy: { refundedAt: "asc" },
			take: limit,
		});
	}

	/** ADR-037 §2: `transferred → reversed`; false if another path already recorded it. */
	async markReversed(paymentId: string): Promise<boolean> {
		const { count } = await this.db.payment.updateMany({
			where: { id: paymentId, transferStatus: "transferred" },
			data: { transferStatus: "reversed" },
		});
		return count === 1;
	}

	/** Audit Low-2: mark a row as just tried, so candidate order puts it behind fresh sales. */
	async touch(paymentId: string): Promise<void> {
		await this.db.payment.updateMany({
			where: { id: paymentId },
			data: { updatedAt: new Date() },
		});
	}

	/**
	 * `transferring → pending` when a live check says "not now" (H4, waiting for Stripe) — or
	 * `→ cancelled` when a refund's effects committed while the share was in flight (qa #1), so a
	 * refunded sale never sits in the instructor's owed balance.
	 */
	async releaseClaim(paymentId: string): Promise<boolean> {
		const changed = await this.db.$executeRaw`
			UPDATE payments
			   SET transfer_status = CASE WHEN status = 'refunded'
			                              THEN 'cancelled'::"TransferStatus"
			                              ELSE 'pending'::"TransferStatus" END,
			       updated_at = now()
			 WHERE id = ${paymentId} AND transfer_status = 'transferring'`;
		return changed === 1;
	}
}

export const payoutRepository = new PayoutRepository();
