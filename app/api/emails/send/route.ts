import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	ResendSendError,
	UnknownTemplateError,
} from "@/server/services/email/email.errors";
import { emailService } from "@/server/services/email/email.service";
import { requireBearer } from "@/server/services/notifications/auth";

const SendEmailBodySchema = z.object({
	templateKey: z.string().min(1),
	toEmail: z.email(),
	userId: z.string().optional(),
	payload: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const raw = await req.json();
	const parsed = SendEmailBodySchema.safeParse(raw);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_payload", issues: parsed.error.issues },
			{ status: 422 },
		);
	}

	try {
		const result = await emailService.send(parsed.data);
		return NextResponse.json(result);
	} catch (e) {
		if (e instanceof UnknownTemplateError) {
			return NextResponse.json({ error: "unknown_template" }, { status: 400 });
		}
		if (e instanceof ResendSendError) {
			return NextResponse.json(
				{ error: "resend_failed", detail: e.message },
				{ status: 502 },
			);
		}
		throw e;
	}
}
