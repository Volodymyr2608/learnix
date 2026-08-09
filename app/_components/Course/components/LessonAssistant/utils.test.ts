import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inAppUrlTransform } from "./utils";

const ORIGINAL = globalThis.window;

beforeAll(() => {
	(globalThis as { window?: unknown }).window = {
		location: { origin: "https://app.learnix.test" },
	};
});

afterAll(() => {
	(globalThis as { window?: unknown }).window = ORIGINAL;
});

describe("inAppUrlTransform", () => {
	it.each([
		["a root-relative path", "/dashboard/lesson-2"],
		["an anchor", "#section-3"],
		["a query", "?page=2"],
		["a same-origin absolute URL", "https://app.learnix.test/dashboard"],
	])("keeps %s", (_label, url) => {
		expect(inAppUrlTransform(url)).toBe(url);
	});

	it.each([
		["an off-origin URL", "https://evil.example.com/?d=secret"],
		["a protocol-relative URL", "//evil.example.com/?d=secret"],
		["a javascript: URI", "javascript:alert(1)"],
		["a data: URI", "data:text/html;base64,PHNjcmlwdD4="],
	])("drops %s", (_label, url) => {
		expect(inAppUrlTransform(url)).toBeUndefined();
	});
});
