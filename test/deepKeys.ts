/**
 * Finds every path at which an object carries a key with the given name, at any
 * depth, and returns those paths so a failure names where the leak is.
 *
 * Key presence, never a text search: `analytics` legitimately returns a
 * `correct` *count*, which a grep over the payload would flag falsely, and a
 * future nested `include` is what a type check would miss.
 */
export const findKeyPaths = (
	value: unknown,
	key: string,
	path = "$",
): string[] => {
	if (Array.isArray(value)) {
		return value.flatMap((item, i) => findKeyPaths(item, key, `${path}[${i}]`));
	}
	if (value === null || typeof value !== "object") return [];
	if (value instanceof Date) return [];

	return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
		const here = `${path}.${k}`;
		const deeper = findKeyPaths(v, key, here);
		return k === key ? [here, ...deeper] : deeper;
	});
};
