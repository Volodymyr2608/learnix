export type MessageShape = { role: "user" | "assistant"; content: string };

export const isMessageShape = (val: unknown): val is MessageShape => {
	if (typeof val !== "object" || val === null) return false;

	const obj = val as Record<string, unknown>;

	return (
		(obj.role === "user" || obj.role === "assistant") &&
		typeof obj.content === "string"
	);
};
