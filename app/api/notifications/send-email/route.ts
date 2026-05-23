import { emailService } from "@/server/services/email/email.service";
import { requireBearer } from "@/server/services/notifications/auth";

export async function POST(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const body = await req.json();
	const result = await emailService.send(body);
	return Response.json(result);
}
