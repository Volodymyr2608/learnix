/** Placeholder rows rendered in the table body while students load. */
export const SKELETON_ROWS = Array.from(
	{ length: 5 },
	(_, i) => `skeleton-row-${i}`,
);
