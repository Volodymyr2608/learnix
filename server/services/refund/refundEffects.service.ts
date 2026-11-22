import type { CertificateRevocationReason } from "@/generated/prisma";
import { db } from "@/server/db";
import type { RefundEffectPath } from "@/server/entities/refund/refund.dto";
import { refundEffectsRepository } from "@/server/repositories/refundEffects.repository";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { connectService } from "@/server/services/payments/connect.service";
import { logger } from "@/server/utils/logger";

const REVOCATION_REASON: Record<RefundEffectPath, CertificateRevocationReason> =
	{
		refund_request: "refund_request",
		dashboard_refund: "dashboard_refund",
		admin_exception: "admin_exception",
		lost_dispute: "lost_dispute",
	};

class RefundEffectsService {
	/**
	 * FR-P6–P14, ADR-037 §4 — the one function every refund path calls. The database effects run
	 * in one transaction behind the `succeeded → refunded` compare-and-set, so a webhook, the daily
	 * replay and a Learnix-initiated refund racing on one payment apply them once (C8). Network
	 * effects run after commit. Returns false (and does nothing) when another caller already won.
	 */
	async apply(input: {
		paymentId: string;
		path: RefundEffectPath;
		now: Date;
	}): Promise<boolean> {
		const { paymentId, path, now } = input;
		// db.$transaction, not BaseRepository.transaction, which wraps errors (as refund.service).
		const payment = await db.$transaction(async (tx) => {
			const claimed = await refundEffectsRepository.claimRefund(
				tx,
				paymentId,
				now,
			);
			if (!claimed) return null;
			await refundEffectsRepository.applyInTx(
				tx,
				claimed,
				REVOCATION_REASON[path],
				now,
			);
			return claimed;
		});
		if (!payment) return false;

		// FR-P7: a released share is reversed — except after a lost dispute (DL). A failure here
		// leaves the payment refunded + transferred; the daily job retries the reversal.
		if (payment.transferStatus === "transferred" && path !== "lost_dispute") {
			try {
				await connectService.reverseTransfer(payment);
			} catch (error) {
				logger.error("Reversal after refund failed; the daily job retries it", {
					paymentId,
					error,
				});
			}
		}
		// FR-P12: the refunded course stops feeding the interest profile.
		void embeddingsService
			.recomputeUserInterest(payment.studentId)
			.catch((error) => logger.error("recomputeUserInterest failed:", error));
		return true;
	}
}

export const refundEffectsService = new RefundEffectsService();
