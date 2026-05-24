import { z } from "zod";
import { emailService } from "@/server/services/email/email.service";
import { requireBearer } from "@/server/services/notifications/auth";

const SendEmailBodySchema = z.object({
	templateKey: z.string().min(1),
	toEmail: z.email(),
	userId: z.string().optional(),
	payload: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const raw = await req.json();
	const parsed = SendEmailBodySchema.safeParse(raw);
	if (!parsed.success) {
		return Response.json(
			{ error: "invalid_payload", issues: parsed.error.issues },
			{ status: 422 },
		);
	}

	const result = await emailService.send(parsed.data);
	return Response.json(result);
}