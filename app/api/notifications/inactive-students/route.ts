import { requireBearer } from "@/server/services/notifications/auth";
import { notificationService } from "@/server/services/notifications/notification.service";

export async function GET(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const { searchParams } = new URL(req.url);
	const inactiveDays = Number(searchParams.get("inactiveDays") ?? 7);
	const minPct = Number(searchParams.get("minProgressPct") ?? 10);
	const maxPct = Number(searchParams.get("maxProgressPct") ?? 99);

	const items = await notificationService.findInactiveStudents({
		inactiveDays,
		minPct,
		maxPct,
	});

	return Response.json({ items, generatedAt: new Date().toISOString() });
}
