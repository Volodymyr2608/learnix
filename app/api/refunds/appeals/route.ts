import { getSession } from "@/server/better-auth/server";
import { DomainError } from "@/server/services/base/base.errors";
import { refundAppealService } from "@/server/services/refund/refundAppeal.service";
import {
	chosenFiles,
	formField,
	isOverBodyLimit,
	refundErrorStatus,
} from "@/server/services/refund/refundHttp";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";

/**
 * FR-S15 (V8): the appeal's text and files in one multipart request. The student comes from the
 * session (C1); the service decides everything else.
 */
export const POST = async (req: Request) => {
	const session = await getSession();
	if (!session?.user) return new Response(null, { status: 401 });
	if (session.user.role !== "STUDENT")
		return new Response(null, { status: 403 });
	if (isOverBodyLimit(req))
		return Response.json(
			{ error: "The files are too large." },
			{ status: 413 },
		);

	try {
		const form = await req.formData();
		const result = await refundAppealService.fileAppeal(session.user.id, {
			paymentId: formField(form, "paymentId"),
			reason: formField(form, "reason"),
			text: formField(form, "text"),
			files: chosenFiles(form),
		});
		return Response.json(result, { status: 201 });
	} catch (error) {
		if (error instanceof DomainError)
			return Response.json(
				{ error: error.message },
				{ status: refundErrorStatus(error) },
			);
		logger.error("Appeal filing failed", { error });
		return Response.json({ error: "Something went wrong." }, { status: 500 });
	}
};
