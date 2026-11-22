import { env } from "@/lib/env";
import { bearerMatches } from "@/server/services/notifications/auth";

const MIN_SECRET_LENGTH = 32;

/**
 * C15 — only Vercel Cron, holding `CRON_SECRET`, may call the payout cron routes. The length is
 * re-checked here because env validation is skipped in tests and some builds; a missing or short
 * secret refuses everyone.
 */
export const isCronRequest = (req: Request): boolean => {
	const secret = env.CRON_SECRET;
	return (
		!!secret && secret.length >= MIN_SECRET_LENGTH && bearerMatches(req, secret)
	);
};
