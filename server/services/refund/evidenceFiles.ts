import { EvidenceRejectedError } from "./refund.errors";

/** FR-S15 / C21: at most 3 files and 4 MB in total per submission. */
export const EVIDENCE_MAX_FILES = 3;
export const EVIDENCE_MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export type EvidenceContentType =
	| "image/png"
	| "image/jpeg"
	| "application/pdf";

export type AcceptedEvidence = {
	file: File;
	contentType: EvidenceContentType;
};

/** C21: the type is decided by the file's first bytes; the name and the declared type are ignored. */
const SIGNATURES: { type: EvidenceContentType; bytes: number[] }[] = [
	{
		type: "image/png",
		bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	},
	{ type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
	{ type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

const detect = async (file: File): Promise<EvidenceContentType | null> => {
	const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
	const match = SIGNATURES.find(({ bytes }) =>
		bytes.every((byte, i) => head[i] === byte),
	);
	return match?.type ?? null;
};

/** C21: validates a whole submission or throws `EvidenceRejectedError`; zero files is valid (AC-F8). */
export const validateEvidence = async (
	files: File[],
): Promise<AcceptedEvidence[]> => {
	if (files.length > EVIDENCE_MAX_FILES)
		throw new EvidenceRejectedError("count");
	const total = files.reduce((sum, f) => sum + f.size, 0);
	if (total > EVIDENCE_MAX_TOTAL_BYTES) throw new EvidenceRejectedError("size");
	const accepted: AcceptedEvidence[] = [];
	for (const file of files) {
		const contentType = await detect(file);
		if (!contentType) throw new EvidenceRejectedError("type");
		accepted.push({ file, contentType });
	}
	return accepted;
};
