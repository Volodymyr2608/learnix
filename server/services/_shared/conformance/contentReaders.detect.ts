/**
 * AC-L7 / AI-C7 — how `contentReaders.contract.test.ts` recognises a reader of lesson content in
 * source text. Kept apart from the test so its self-test can plant the shapes it must catch.
 *
 * A Prisma read returns `Lesson.content` when it selects `content: true`, or when it loads lesson
 * rows with no `select` at all — directly (`lessonRepository.findFirst({ where })`) or through a
 * relation (`sections: { include: { lessons: true } }`). Both count.
 */

/** Source with comments stripped, so commented-out code is not evidence. */
export const stripComments = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** The balanced `{…}` or `(…)` that opens at `start`, inclusive; null when unbalanced. */
const balanced = (source: string, start: number): string | null => {
	const open = source[start];
	const close = open === "{" ? "}" : ")";
	let depth = 0;
	for (let i = start; i < source.length; i++) {
		if (source[i] === open) depth++;
		if (source[i] === close) depth--;
		if (depth === 0) return source.slice(start, i + 1);
	}
	return null;
};

/** The keys at the top level of an object literal `{…}`. */
const topLevelKeys = (block: string): string[] => {
	const keys: string[] = [];
	let depth = 0;
	const re = /[{}()[\]]|\b(\w+)\s*:/g;
	for (let m = re.exec(block); m; m = re.exec(block)) {
		const token = m[0];
		if ("{([".includes(token)) depth++;
		else if ("})]".includes(token)) depth--;
		else if (depth === 1 && m[1]) keys.push(m[1]);
	}
	return keys;
};

const selectsContent = (block: string): boolean =>
	/\bcontent:\s*true\b/.test(block);

/** A `lessons:` relation that loads full rows or selects `content`. */
const readsThroughRelation = (source: string): boolean => {
	const re =
		/(?<!_sum:\s*\{\s*|_count:\s*\{\s*|_avg:\s*\{\s*)\blessons:\s*(true\b|\{)/g;
	for (let m = re.exec(source); m; m = re.exec(source)) {
		if (m[1] === "true") return true;
		const block = balanced(source, m.index + m[0].length - 1);
		if (!block) continue;
		const keys = topLevelKeys(block);
		if (keys.length > 0 && keys.every((k) => RELATION_FILTERS.has(k))) continue;
		if (!keys.includes("select")) return true;
		if (selectsContent(block)) return true;
	}
	return false;
};

/** `lessons: { some: … }` inside a `where` filters; it loads nothing. */
const RELATION_FILTERS = new Set(["some", "every", "none"]);

/** Prisma's and `BaseRepository`'s row reads; custom repository methods choose their own select. */
const lessonFind = (): RegExp =>
	/\b(?:lessonRepository|(?:this\.)?db\.lesson|tx\.lesson)\.(?:findOne|findFirst\w*|findMany|findUnique\w*)\(/g;

/** A direct lesson `find*` call with no `select`, or one selecting `content`. */
const readsDirectly = (source: string): boolean => {
	const re = lessonFind();
	for (let m = re.exec(source); m; m = re.exec(source)) {
		const args = balanced(source, m.index + m[0].length - 1);
		if (!args) continue;
		const objectStart = args.indexOf("{");
		if (objectStart === -1) return true; // findOne(id): the whole row
		const object = balanced(args, objectStart);
		if (!object) continue;
		if (!topLevelKeys(object).includes("select")) return true;
		if (selectsContent(object)) return true;
	}
	return false;
};

const CHUNKS_OR_INSIGHTS = [
	/searchCourseChunks\(|searchLessonChunks\(/,
	/lessonInsightsRepository\.\w+\(/,
	/\blessons\.content\b|\bl\.content\b/,
];

export const isReader = (rawSource: string): boolean => {
	const source = stripComments(rawSource);
	return (
		CHUNKS_OR_INSIGHTS.some((r) => r.test(source)) ||
		readsThroughRelation(source) ||
		readsDirectly(source)
	);
};

/**
 * The body of the function or method named `symbol` — `async name(`, `name(`, or
 * `const name = (` — or null when the file does not define it.
 */
export const functionBody = (
	rawSource: string,
	symbol: string,
): string | null => {
	const source = stripComments(rawSource);
	const def = new RegExp(
		`(?:^|\\s)(?:async\\s+)?${symbol}\\s*(?:=\\s*(?:async\\s*)?)?\\(`,
		"m",
	).exec(source);
	if (!def) return null;
	const params = balanced(source, def.index + def[0].length - 1);
	if (!params) return null;
	const brace = source.indexOf(
		"{",
		def.index + def[0].length - 1 + params.length,
	);
	if (brace === -1) return null;
	return balanced(source, brace);
};

/** What a gated reader must contain inside the named function (G1). */
export const GATE = /lessonOpenedBy\(|lessonOpenedSelect\(|opened_lessons/;
