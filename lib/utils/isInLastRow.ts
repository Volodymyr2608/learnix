/**
 * Whether the item at `index` sits in the final row of a row-major grid.
 *
 * CSS cannot answer this: `:last-child` is the last *item*, but a two-column
 * grid with an even count has two items on the bottom row, and only one of them
 * is `:last-child`. The other keeps its bottom rule and draws a stray line under
 * the left column.
 *
 * Row-major is the assumption and it matches CSS grid's default `grid-auto-flow:
 * row` — the layout these lists use.
 */
export const isInLastRow = (
	index: number,
	count: number,
	columns: number,
): boolean => {
	if (count <= 0 || columns <= 0) return false;

	const lastRowStart = (Math.ceil(count / columns) - 1) * columns;
	return index >= lastRowStart;
};
