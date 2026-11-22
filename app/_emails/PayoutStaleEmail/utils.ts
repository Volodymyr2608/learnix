export const lastSuccessLine = (lastSuccessAt: string | null): string =>
	lastSuccessAt
		? `The last successful run was at ${lastSuccessAt}.`
		: "No run has ever succeeded.";
