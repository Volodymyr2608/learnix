import { notificationLogRepository } from "@/server/repositories/notificationLog.repository";
import { emailService } from "@/server/services/email/email.service";
import type { TemplateKey } from "@/server/services/email/email.templates";
import { logger } from "@/server/utils/logger";

/**
 * M5: one email per de-dup key. The key is logged first, so concurrent callers send once; a failed
 * send deletes it again, so a later call can retry. Callers that run once must be re-driven by a
 * sweep (the payout watchdog re-sends refund emails, review I2).
 */
export const sendOnce = async (input: {
	dedupKey: string;
	userId: string;
	automation: string;
	templateKey: TemplateKey;
	toEmail: string;
	payload: unknown;
}): Promise<boolean> => {
	const logged = await notificationLogRepository.tryLog({
		dedupKey: input.dedupKey,
		userId: input.userId,
		automation: input.automation,
	});
	if (!logged.created) return false;
	try {
		await emailService.send({
			templateKey: input.templateKey,
			toEmail: input.toEmail,
			userId: input.userId,
			payload: input.payload,
		});
		return true;
	} catch (error) {
		await notificationLogRepository.deleteByDedupKey(input.dedupKey);
		logger.error("A once-only email failed; it will be retried", {
			dedupKey: input.dedupKey,
			error,
		});
		return false;
	}
};
