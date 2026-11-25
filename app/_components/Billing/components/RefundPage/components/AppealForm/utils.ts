/** FR-S15 / C21: what the file picker offers; the server checks the content anyway. */
export const APPEAL_ACCEPT = "image/png,image/jpeg,application/pdf";
export const MAX_APPEAL_FILES = 3;

const BY_STATUS: Record<number, string> = {
	413: "The files are too large (4 MB in total at most).",
	415: "Only PNG, JPEG or PDF files can be attached.",
	429: "Too many attempts. Please try again in a minute.",
};

/** What the student is told when the appeal is refused; the server's own text for a 409/422. */
export const appealErrorMessage = (
	status: number,
	serverMessage: string | undefined,
): string => {
	if (BY_STATUS[status]) return BY_STATUS[status];
	if ((status === 409 || status === 422) && serverMessage) return serverMessage;
	return "The appeal could not be sent. Please try again.";
};
