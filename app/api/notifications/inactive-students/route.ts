import { z } from "zod";
import { requireBearer } from "@/server/services/notifications/auth";
import { notificationService } from "@/server/services/notifications/notification.service";

const ParamsSchema = z.object({
	inactiveDays: z.coerce.number().int().min(1).max(365).default(7),
	minProgressPct: z.coerce.number().int().min(0).max(100).default(10),
	maxProgressPct: z.coerce.number().int().min(0).max(100).default(99),
});

export async function GET(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const { searchParams } = new URL(req.url);
	const parsed = ParamsSchema.safeParse(Object.fromEntries(searchParams));
	if (!parsed.success) {
		return Response.json(
			{ error: "invalid_params", issues: parsed.error.issues },
			{ status: 422 },
		);
	}
	const {
		inactiveDays,
		minProgressPct: minPct,
		maxProgressPct: maxPct,
	} = parsed.data;

	const items = await notificationService.findInactiveStudents({
		inactiveDays,
		minPct,
		maxPct,
	});

	return Response.json({ items, generatedAt: new Date().toISOString() });
}
