export const isAbortError = (
	error: unknown,
): error is { name: "AbortError" } => {
	return (
		typeof error === "object" &&
		error !== null &&
		"name" in error &&
		error.name === "AbortError"
	);
};
