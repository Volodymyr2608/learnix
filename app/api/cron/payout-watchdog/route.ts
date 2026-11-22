import { isCronRequest } from "@/server/services/payments/cronAuth";
import { payoutWatchdogService } from "@/server/services/payments/payoutWatchdog.service";

export const runtime = "nodejs";

/**
 * M3 — a second daily cron that notices what the release run cannot report about itself: no
 * successful run for 48 h (FR-A10) and refunds still processing after 3 days (FR-A11). Same
 * secret check as the release route (C15); counts only in the response.
 */
export const GET = async (req: Request): Promise<Response> => {
	if (!isCronRequest(req)) {
		return new Response(null, { status: 401 });
	}
	const result = await payoutWatchdogService.check(new Date());
	return Response.json(result);
};
