import { z } from "zod";
import { notificationLogRepository } from "@/server/repositories/notificationLog.repository";
import { requireBearer } from "@/server/services/notifications/auth";

const LogBodySchema = z.object({
	dedupKey: z.string().min(1),
	userId: z.string().min(1),
	automation: z.string().min(1),
	payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const raw = await req.json();
	const parsed = LogBodySchema.safeParse(raw);
	if (!parsed.success) {
		return Response.json(
			{ error: "invalid_payload", issues: parsed.error.issues },
			{ status: 422 },
		);
	}

	const result = await notificationLogRepository.tryLog(parsed.data);
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
