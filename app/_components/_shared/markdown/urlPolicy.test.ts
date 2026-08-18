import type { Element } from "hast";
import { describe, expect, it } from "vitest";
import { authoredContentUrlPolicy, modelOutputUrlPolicy } from "./urlPolicy";

const OWN = "http://localhost:3000";

const node = (tagName: string): Element =>
	({ type: "element", tagName, properties: {}, children: [] }) as Element;

const asImage = (policy: typeof authoredContentUrlPolicy, url: string) =>
	policy(url, "src", node("img"));

const asLink = (policy: typeof authoredContentUrlPolicy, url: string) =>
	policy(url, "href", node("a"));

describe("authoredContentUrlPolicy (AC 48)", () => {
	it("keeps an off-origin link but drops the same URL as an image", () => {
		const url = "https://developer.mozilla.org/en-US/docs/Web/API";

		expect(asLink(authoredContentUrlPolicy, url)).toBe(url);
		expect(asImage(authoredContentUrlPolicy, url)).toBeUndefined();
	});

	it("keeps in-app destinations in either position", () => {
		for (const url of ["/dashboard/courses/abc", `${OWN}/x`, "#anchor"]) {
			expect(asLink(authoredContentUrlPolicy, url)).toBe(url);
			expect(asImage(authoredContentUrlPolicy, url)).toBe(url);
		}
	});

	it("drops a disallowed scheme in either position (AC 50)", () => {
		for (const url of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			"data:text/html,x",
			"vbscript:msgbox",
			"blob:https://evil.example.com/x",
			"file:///etc/passwd",
			"//evil.example.com/x",
		]) {
			expect(asLink(authoredContentUrlPolicy, url), url).toBeUndefined();
			expect(asImage(authoredContentUrlPolicy, url), url).toBeUndefined();
		}
	});

	it("treats a video source as image-like — it loads without a click too", () => {
		const url = "https://evil.example.com/beacon.mp4";

		expect(authoredContentUrlPolicy(url, "src", node("video"))).toBeUndefined();
	});
});

describe("modelOutputUrlPolicy (AC 49)", () => {
	it("drops both an off-origin image and an off-origin link", () => {
		const url = "https://evil.example.com/p";

		expect(asLink(modelOutputUrlPolicy, url)).toBeUndefined();
		expect(asImage(modelOutputUrlPolicy, url)).toBeUndefined();
	});

	it("keeps in-app destinations, which is how the tutor links a lesson", () => {
		expect(asLink(modelOutputUrlPolicy, "/dashboard/lesson-2")).toBe(
			"/dashboard/lesson-2",
		);
	});

	it("drops every disallowed scheme (AC 50)", () => {
		for (const url of [
			"javascript:alert(1)",
			"data:text/html,x",
			"blob:https://x/y",
			"file:///etc",
			"//evil.example.com",
		]) {
			expect(asLink(modelOutputUrlPolicy, url), url).toBeUndefined();
		}
	});
});
