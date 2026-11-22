import { env } from "@/lib/env";
import { bearerMatches } from "@/server/services/notifications/auth";
import { payoutJobService } from "@/server/services/payments/payoutJob.service";

export const runtime = "nodejs";
/** Vercel Hobby allows 300 s per function run (FR-P3). */
export const maxDuration = 300;

const MIN_SECRET_LENGTH = 32;

/**
 * ADR-037 §3 — the daily payout release, called by Vercel Cron (`vercel.json`). Only the
 * scheduler's secret gets in (C15): anything else is an empty 401 and nothing runs. The secret
 * length is re-checked here because env validation is skipped in tests and some builds.
 */
export const GET = async (req: Request): Promise<Response> => {
	const secret = env.CRON_SECRET;
	if (
		!secret ||
		secret.length < MIN_SECRET_LENGTH ||
		!bearerMatches(req, secret)
	) {
		return new Response(null, { status: 401 });
	}

	const summary = await payoutJobService.run({
		trigger: "cron",
		now: new Date(),
	});
	if (summary.status === "already_running") {
		return Response.json({ status: "already_running" });
	}
	// Counts only — payment ids stay in the PayoutRun row (C15).
	const { processed, released, failed } = summary;
	return Response.json({ status: "completed", processed, released, failed });
};
