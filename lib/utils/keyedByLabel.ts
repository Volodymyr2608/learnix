export type Keyed<T> = { key: string; value: T };

/**
 * Pairs each item with a React key derived from a label that is *not* known to
 * be unique — a concept name or a glossary term, both model-authored, neither
 * constrained to be distinct by any schema in the pipeline.
 *
 * The first occurrence keeps the label; later ones are suffixed `#2`, `#3`.
 * Duplicate keys are not a lint nit: React drops the colliding sibling on
 * reconciliation, so two concepts sharing a name would cost one of them its row
 * — while the count rendered beside the heading still said two.
 *
 * The position is deliberately not part of the key. An index-based key defeats
 * reconciliation and is what `lint/suspicious/noArrayIndexKey` exists to stop;
 * a label plus an occurrence ordinal is stable for the only mutation these
 * lists undergo, which is being replaced wholesale on regenerate.
 */
export const keyedByLabel = <T>(
	items: T[],
	label: (item: T) => string,
): Keyed<T>[] => {
	const seen = new Map<string, number>();

	return items.map((value) => {
		const base = label(value);
		const occurrence = seen.get(base) ?? 0;
		seen.set(base, occurrence + 1);

		return {
			key: occurrence === 0 ? base : `${base}#${occurrence + 1}`,
			value,
		};
	});
};
