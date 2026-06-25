/** Truncate to `max` chars inclusive of a trailing ellipsis; shorter strings pass through. */
export const truncateLabel = (value: string, max: number): string =>
	value.length > max ? `${value.slice(0, max - 1)}…` : value;
