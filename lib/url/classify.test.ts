import { describe, expect, it } from "vitest";
import { classifyUrl, hasSafeScheme, isOffOrigin } from "./classify";

// .env.test sets NEXT_PUBLIC_APP_URL to http://localhost:3000.
const OWN = "http://localhost:3000";

describe("classifyUrl", () => {
	it("treats relative destinations as in-app", () => {
		for (const url of ["/dashboard", "./next", "../up", "#anchor", "?q=1"]) {
			expect(classifyUrl(url)).toBe("in_app");
		}
	});

	it("treats our own absolute origin as in-app", () => {
		expect(classifyUrl(`${OWN}/dashboard/courses`)).toBe("in_app");
	});

	it("treats another origin as off-origin", () => {
		expect(classifyUrl("https://evil.example.com/p")).toBe("off_origin");
	});

	it("drops a protocol-relative destination", () => {
		expect(classifyUrl("//evil.example.com/p")).toBe("drop");
	});

	it("drops every scheme outside the allowlist, whatever its casing", () => {
		for (const url of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			"data:text/html,<script>x</script>",
			"vbscript:msgbox",
			"blob:https://evil.example.com/abc",
			"file:///etc/passwd",
		]) {
			expect(classifyUrl(url), url).toBe("drop");
		}
	});

	it("allows mailto, which is neither in-app navigation nor exfiltration", () => {
		expect(classifyUrl("mailto:tutor@example.com")).toBe("off_origin");
	});

	it("drops a scheme hidden behind leading whitespace or a control char", () => {
		// The browser strips these before resolving, so an anchored scheme test
		// that does not is judging a different string than the one that loads.
		for (const url of [
			" javascript:alert(1)",
			"\tjavascript:alert(1)",
			"\njavascript:alert(1)",
			"\u0001javascript:alert(1)",
			" https://evil.example/beacon.png",
			"\thttps://evil.example/beacon.png",
		]) {
			expect(classifyUrl(url), JSON.stringify(url)).not.toBe("in_app");
		}
	});

	it("drops a scheme split by an interior tab or newline", () => {
		expect(classifyUrl("java\tscript:alert(1)")).toBe("drop");
		expect(classifyUrl("java\nscript:alert(1)")).toBe("drop");
	});

	it("drops a backslash-prefixed authority, which resolves like //", () => {
		expect(classifyUrl("/\\evil.example.com/p")).toBe("drop");
	});

	it("still treats an ordinary relative path with a trailing space as in-app", () => {
		expect(classifyUrl("/dashboard/courses ")).toBe("in_app");
	});

	it("drops an unparseable destination", () => {
		expect(classifyUrl("http://[::1")).toBe("drop");
	});

	it("classifies without touching window (SSR safety)", () => {
		const saved = globalThis.window;
		// @ts-expect-error — simulate the server, where a prerendered client
		// component has no window at all.
		delete globalThis.window;

		expect(() => classifyUrl("https://external.example/p")).not.toThrow();
		expect(classifyUrl("https://external.example/p")).toBe("off_origin");
		expect(classifyUrl("/dashboard")).toBe("in_app");

		globalThis.window = saved;
	});
});

describe("the two predicates answer different questions", () => {
	it("hasSafeScheme rejects every disallowed scheme, and isOffOrigin does not", () => {
		for (const url of [
			"javascript:alert(1)",
			"data:text/html,x",
			"blob:https://x/y",
			"file:///etc",
		]) {
			expect(hasSafeScheme(url), url).toBe(false);
			// The trap: a DTO gating only on isOffOrigin would accept all of these.
			expect(isOffOrigin(url), url).toBe(false);
		}
	});

	it("agree on an ordinary off-origin link", () => {
		expect(hasSafeScheme("https://external.example/p")).toBe(true);
		expect(isOffOrigin("https://external.example/p")).toBe(true);
	});
});
