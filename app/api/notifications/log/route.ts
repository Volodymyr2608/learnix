import { notificationLogRepository } from "@/server/repositories/notificationLog.repository";
import { requireBearer } from "@/server/services/notifications/auth";

export async function POST(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const body = await req.json();
	const result = await notificationLogRepository.tryLog(body);
	return Response.json({ created: result.created });
}

export async function DELETE(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const dedupKey = new URL(req.url).searchParams.get("dedupKey");
	if (!dedupKey) {
		return new Response("dedupKey required", { status: 400 });
	}
	await notificationLogRepository.deleteByDedupKey(dedupKey);
	return Response.json({ deleted: true });
}
