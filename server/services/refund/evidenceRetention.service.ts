import { refundAppealRepository } from "@/server/repositories/refundAppeal.repository";
import { logger } from "@/server/utils/logger";
import { refundEvidenceStorage } from "./refundEvidenceStorage";

/** FR-P22 (W10): files are kept 30 days after the final decision, then deleted. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH = 100;

class EvidenceRetentionService {
	/**
	 * FR-P22 / AC-F18 (W10): deletes, per daily run, up to 100 evidence files of appeals decided at
	 * least 30 days ago — the blob first, then the row's `deleted_at`. A failed blob delete leaves the
	 * row for the next run. Undecided appeals are never touched; texts, snapshot and audit stay.
	 */
	async deleteExpired(now: Date): Promise<number> {
		const files = await refundAppealRepository.findExpiredEvidence(
			new Date(now.getTime() - RETENTION_MS),
			BATCH,
		);
		let deleted = 0;
		for (const file of files) {
			try {
				await refundEvidenceStorage.del([file.blobPathname]);
				await refundAppealRepository.markEvidenceDeleted([file.id], now);
				deleted++;
			} catch (error) {
				logger.warn("Evidence delete failed; retried next run", {
					fileId: file.id,
					error,
				});
			}
		}
		return deleted;
	}
}

export const evidenceRetentionService = new EvidenceRetentionService();
