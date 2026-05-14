import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
	InvalidPayloadError,
	ResendSendError,
	UnknownTemplateError,
} from "@/server/services/email/email.errors";
import { emailService } from "@/server/services/email/email.service";

export async function POST(req: NextRequest) {
	if (req.headers.get("authorization") !== `Bearer ${env.N8N_API_TOKEN}`) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	try {
		const body = await req.json();
		const result = await emailService.send(body);
		return NextResponse.json(result);
	} catch (e) {
		if (e instanceof UnknownTemplateError) {
			return NextResponse.json({ error: "unknown_template" }, { status: 400 });
		}
		if (e instanceof InvalidPayloadError) {
			return NextResponse.json(
				{ error: "invalid_payload", issues: e.issues },
				{ status: 422 },
			);
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
