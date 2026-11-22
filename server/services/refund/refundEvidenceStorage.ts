import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { env } from "@/lib/env";
import type { EvidenceContentType } from "./evidenceFiles";

/**
 * V5 / C20: refund evidence lives in a PRIVATE Blob store with its own token. Pathnames are random —
 * never the student's file name — and a blob is only ever read back through the authorizing route.
 */
const token = () => env.REFUND_EVIDENCE_BLOB_TOKEN;

export class EvidenceStorageUnavailableError extends Error {}

export const refundEvidenceStorage = {
	isConfigured: (): boolean => Boolean(token()),

	async put(file: File, contentType: EvidenceContentType): Promise<string> {
		const configured = token();
		if (!configured) throw new EvidenceStorageUnavailableError();
		const result = await put(`refund-evidence/${randomUUID()}`, file, {
			access: "private",
			token: configured,
			contentType,
			addRandomSuffix: false,
		});
		return result.pathname;
	},

	async get(pathname: string) {
		const result = await get(pathname, { access: "private", token: token() });
		return result?.statusCode === 200 ? result.stream : null;
	},

	async del(pathnames: string[]): Promise<void> {
		if (pathnames.length === 0) return;
		await del(pathnames, { token: token() });
	},
};
