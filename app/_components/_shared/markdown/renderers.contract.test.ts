import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "@/app/_components/Course/components/CourseLearnView/components/MarkdownContent";
import { POLICY_NAME, RENDERER_POLICY } from "./renderers";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return /\.tsx?$/.test(full) ? [full] : [];
	});

const appFiles = (): string[] =>
	walk("app").filter((f) => !f.includes(".test."));

/** Files that RENDER markdown — a type-only import is not a renderer. */
const markdownImporters = (): string[] =>
	appFiles().filter((file) => {
		const source = readFileSync(file, "utf-8");
		return (
			/^import (?!type )[^\n]*from\s+["']react-markdown["']/m.test(source) &&
			/<(ReactMarkdown|Markdown)\b/.test(source)
		);
	});

const render = (content: string): string =>
	renderToStaticMarkup(createElement(MarkdownContent, { content }));

describe("every markdown renderer declares and uses a policy (AC 54)", () => {
	it("matches the declared map exactly — in both directions", () => {
		// One direction alone is registration coverage pretending to be real
		// coverage: a new renderer would be invisible, which is the failure this
		// whole feature exists to end.
		expect(markdownImporters().sort()).toEqual(
			Object.keys(RENDERER_POLICY).sort(),
		);
	});

	it("passes the declared policy to urlTransform at each site", () => {
		const wrong = Object.entries(RENDERER_POLICY).filter(([file, policy]) => {
			const source = readFileSync(file, "utf-8");
			const name = POLICY_NAME.get(policy) as string;
			return !new RegExp(`urlTransform=\\{${name}\\}`).test(source);
		});

		expect(wrong.map(([file]) => file)).toEqual([]);
	});

	it("enables no raw HTML in any markdown renderer (AC 51)", () => {
		// Scoped to the renderers, and comment-stripped: the file that documents
		// why rehype-raw is absent must not read as a use of it. Raw HTML
		// elsewhere in app/ (a chart's CSS variables, the theme script) is a
		// different decision on different content.
		const raw = Object.keys(RENDERER_POLICY).filter((file) =>
			/rehype-raw|rehypeRaw|allowDangerousHtml|dangerouslySetInnerHTML/.test(
				readFileSync(file, "utf-8")
					.replace(/\/\*[\s\S]*?\*\//g, "")
					.replace(/\/\/.*$/gm, ""),
			),
		);

		expect(raw).toEqual([]);
	});
});

describe("the policy is enforced at render, not merely imported", () => {
	it("drops an off-origin image source", () => {
		const html = render("![x](https://external.example/p.png)");

		// react-markdown keeps the element and drops the attribute; an <img> with
		// no src loads nothing, which is the property that matters.
		expect(html).not.toContain("external.example");
		expect(html).not.toContain("src=");
	});

	it("keeps the link but drops the image when one nests inside the other (AC 52)", () => {
		const html = render(
			"[![banner](https://external.example/b.png)](https://developer.mozilla.org/)",
		);

		expect(html).toContain("developer.mozilla.org");
		expect(html).not.toContain("external.example");
	});

	it("drops a reference-style off-origin image definition (AC 52)", () => {
		const html = render("![x][ref]\n\n[ref]: https://external.example/p.png");

		expect(html).not.toContain("external.example");
		expect(html).not.toContain("src=");
	});

	it("preserves an off-origin autolink under the authored policy (AC 52)", () => {
		const html = render("<https://developer.mozilla.org/en-US/>");

		expect(html).toContain("developer.mozilla.org");
	});

	it("keeps an off-origin link, because a link costs a click", () => {
		const html = render("[docs](https://developer.mozilla.org/en-US/)");

		expect(html).toContain("developer.mozilla.org");
	});

	it("gives an off-origin anchor rel=noopener noreferrer (AC 53)", () => {
		const html = render("[docs](https://developer.mozilla.org/en-US/)");

		expect(html).toContain('rel="noopener noreferrer"');
	});

	it("leaves an in-app anchor without it", () => {
		const html = render("[lesson](/dashboard/courses/abc)");

		expect(html).toContain("/dashboard/courses/abc");
		expect(html).not.toContain("noopener");
	});

	it("drops a javascript: destination", () => {
		const html = render("[click](javascript:alert(1))");

		expect(html).not.toContain("javascript:");
	});

	it("renders on the server without throwing — the SSR regression", () => {
		// A policy that reached for window.location would throw here, and the page
		// this protects is server-rendered. The trigger is an ordinary link.
		expect(() => render("[x](https://external.example/p)")).not.toThrow();
	});
});
