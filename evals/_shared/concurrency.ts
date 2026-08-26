/**
 * Runs an async mapper over items, at most `limit` in flight.
 *
 * Evals fan out with `Promise.all` because rows are independent, and for the
 * tutor's own gpt-4o-mini calls that is fine. The judge is not: its prompt
 * carries the rubric, so each call is an order of magnitude more tokens, and a
 * provider's per-minute token limit is a hard ceiling. Firing all of them at
 * once returns a page of 429s that arrive as judge failures and read exactly
 * like a judge that cannot score — a measurement problem wearing the costume of
 * a quality problem.
 *
 * Results come back in input order, so a caller can zip them against the rows
 * they came from.
 */
export const mapWithConcurrency = async <In, Out>(
	items: readonly In[],
	limit: number,
	fn: (item: In, index: number) => Promise<Out>,
): Promise<Out[]> => {
	const results = new Array<Out>(items.length);
	let next = 0;

	const worker = async (): Promise<void> => {
		while (next < items.length) {
			const index = next;
			next += 1;
			const item = items[index] as In;
			results[index] = await fn(item, index);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, worker),
	);

	return results;
};
