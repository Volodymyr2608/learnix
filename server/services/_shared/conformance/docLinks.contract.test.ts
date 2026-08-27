import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every relative `.md` link under `docs/`, plus the two root documents everyone
 * reads first, resolves to a file that exists.
 *
 * Deleting `ai-hardening-plan.md` left nine dead links across ADRs and feature
 * specs, and nothing said so — the docs are the navigation layer for this repo
 * (`documentation-process.md`: "everything an agent needs to navigate starts at
 * features/_index.md"), so a link that 404s sends a reader, or an agent, to a
 * file that has not existed for weeks.
 *
 * This is the class the constitution asks to be turned into a check rather than
 * remembered: mechanically decidable, and otherwise found only by someone
 * clicking.
 */

const DOCS = "docs";

/**
 * Personal working notes (gitignored, not repo navigation) and the templates,
 * whose links are placeholders pointing at where a real feature's files will
 * sit rather than at files of their own.
 */
const EXCLUDED = ["docs/tech-review-prep", "docs/templates"];

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (EXCLUDED.some((skip) => full.startsWith(skip))) return [];
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".md") ? [full] : [];
	});

/**
 * Relative links to other documents. External URLs are somebody else's uptime,
 * a bare anchor (`#section`) points inside the file, and the `.md` restriction
 * keeps prose that *explains* markdown syntax — `[text](url)` — from reading as
 * a link to a file called "url".
 */
const RELATIVE_LINK =
	/\[[^\]]*\]\((?!https?:|mailto:|#)([^)]+\.md)(?:#[^)]*)?\)/g;

const linksIn = (file: string): string[] =>
	[...readFileSync(file, "utf-8").matchAll(RELATIVE_LINK)]
		.map((match) => match[1] ?? "")
		.filter(Boolean);

/** The most-read files in the repo, and outside `docs/`. */
const ROOT_DOCS = ["CLAUDE.md", "README.md"].filter((f) => existsSync(f));

const files = [...walk(DOCS), ...ROOT_DOCS];

describe("documentation links", () => {
	it("finds documents to check", () => {
		expect(files.length).toBeGreaterThan(20);
	});

	it.each(files)("%s links only to files that exist", (file) => {
		const broken = linksIn(file).filter(
			(target) => !existsSync(resolve(dirname(file), target)),
		);

		expect(broken).toEqual([]);
	});
});
