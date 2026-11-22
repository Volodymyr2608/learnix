import type { DomainError } from "@/server/services/base/base.errors";
import { EvidenceRejectedError } from "./refund.errors";

/** 4 MB of files (C21) plus the text and multipart overhead. */
export const MAX_REFUND_BODY_BYTES = 5 * 1024 * 1024;

const STATUS: Partial<Record<DomainError["code"], number>> = {
	NOT_FOUND: 404,
	CONFLICT: 409,
	BAD_REQUEST: 422,
	TOO_MANY_REQUESTS: 429,
	PRECONDITION_FAILED: 503,
};

/** The HTTP status a refund route handler answers for a domain error. */
export const refundErrorStatus = (error: DomainError): number => {
	if (error instanceof EvidenceRejectedError)
		return error.reason === "type" ? 415 : 413;
	return STATUS[error.code] ?? 500;
};

export const formField = (form: FormData, name: string): string => {
	const value = form.get(name);
	return typeof value === "string" ? value : "";
};

/** A browser sends an empty file part when no file was chosen. */
export const chosenFiles = (form: FormData): File[] =>
	form
		.getAll("files")
		.filter(
			(v): v is File => v instanceof File && (v.size > 0 || v.name !== ""),
		);

export const isOverBodyLimit = (req: Request): boolean =>
	Number(req.headers.get("content-length") ?? 0) > MAX_REFUND_BODY_BYTES;
