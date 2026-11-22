import { getSession } from "@/server/better-auth/server";
import { DomainError } from "@/server/services/base/base.errors";
import { EvidenceRejectedError } from "@/server/services/refund/refund.errors";
import { refundAppealService } from "@/server/services/refund/refundAppeal.service";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";

/** 4 MB of files (C21) plus the text and multipart overhead. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const STATUS: Partial<Record<DomainError["code"], number>> = {
	NOT_FOUND: 404,
	CONFLICT: 409,
	BAD_REQUEST: 422,
	TOO_MANY_REQUESTS: 429,
	PRECONDITION_FAILED: 503,
};

const errorStatus = (error: DomainError): number => {
	if (error instanceof EvidenceRejectedError)
		return error.reason === "type" ? 415 : 413;
	return STATUS[error.code] ?? 500;
};

const field = (form: FormData, name: string): string => {
	const value = form.get(name);
	return typeof value === "string" ? value : "";
};

/** A browser sends an empty file part when no file was chosen. */
const chosenFiles = (form: FormData): File[] =>
	form
		.getAll("files")
		.filter(
			(v): v is File => v instanceof File && (v.size > 0 || v.name !== ""),
		);

/**
 * FR-S15 (V8): the appeal's text and files in one multipart request. The student comes from the
 * session (C1); the service decides everything else.
 */
export const POST = async (req: Request) => {
	const session = await getSession();
	if (!session?.user) return new Response(null, { status: 401 });
	if (session.user.role !== "STUDENT")
		return new Response(null, { status: 403 });
	if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
		return Response.json(
			{ error: "The files are too large." },
			{ status: 413 },
		);

	try {
		const form = await req.formData();
		const result = await refundAppealService.fileAppeal(session.user.id, {
			paymentId: field(form, "paymentId"),
			reason: field(form, "reason"),
			text: field(form, "text"),
			files: chosenFiles(form),
		});
		return Response.json(result, { status: 201 });
	} catch (error) {
		if (error instanceof DomainError)
			return Response.json(
				{ error: error.message },
				{ status: errorStatus(error) },
			);
		logger.error("Appeal filing failed", { error });
		return Response.json({ error: "Something went wrong." }, { status: 500 });
	}
};
