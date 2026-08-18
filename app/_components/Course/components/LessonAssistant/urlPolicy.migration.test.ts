import { describe, expect, it } from "vitest";
import { modelOutputUrlPolicy } from "@/app/_components/_shared/markdown/urlPolicy";

/**
 * The tutor's own URL rules, kept verbatim from `utils.test.ts` (which pinned
 * `inAppUrlTransform`) and re-pointed at the shared policy that replaced it.
 *
 * The module went away because a second regex answering the same question as
 * the shared policy is the drift this feature exists to remove — but the
 * BEHAVIOUR it guaranteed for the tutor is not allowed to go away with it, so
 * every row below is the row that was there before.
 */
const node = (tagName: string) =>
	({
		type: "element",
		tagName,
		properties: {},
		children: [],
	}) as Parameters<typeof modelOutputUrlPolicy>[2];

const transform = (url: string) => modelOutputUrlPolicy(url, "href", node("a"));

describe("the tutor's link rules survive the move to the shared policy", () => {
	it.each([
		["a root-relative path", "/dashboard/lesson-2"],
		["an anchor", "#section-3"],
		["a query", "?page=2"],
		// .env.test sets NEXT_PUBLIC_APP_URL; the old test stubbed window.location.
		["a same-origin absolute URL", "http://localhost:3000/dashboard"],
	])("keeps %s", (_label, url) => {
		expect(transform(url)).toBe(url);
	});

	it.each([
		["an off-origin URL", "https://evil.example.com/?d=secret"],
		["a protocol-relative URL", "//evil.example.com/?d=secret"],
		["a javascript: URI", "javascript:alert(1)"],
		["a data: URI", "data:text/html;base64,PHNjcmlwdD4="],
	])("drops %s", (_label, url) => {
		expect(transform(url)).toBeUndefined();
	});
});
