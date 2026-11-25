import { isCronRequest } from "@/server/services/payments/cronAuth";
import { payoutJobService } from "@/server/services/payments/payoutJob.service";

export const runtime = "nodejs";
/** Vercel Hobby allows 300 s per function run (FR-P3). */
export const maxDuration = 300;

/**
 * ADR-037 §3 — the daily payout release, called by Vercel Cron (`vercel.json`). Only the
 * scheduler's secret gets in (C15, `isCronRequest`): anything else is an empty 401 and nothing runs.
 */
export const GET = async (req: Request): Promise<Response> => {
	if (!isCronRequest(req)) {
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
