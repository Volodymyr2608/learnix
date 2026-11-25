export const exceptionResultText = (
	status: "refunded" | "already_refunded",
): string =>
	status === "refunded"
		? "Refunded as an exception."
		: "This payment was already refunded; nothing changed.";
