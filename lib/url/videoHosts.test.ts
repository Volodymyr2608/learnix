import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowedVideoUrl } from "./videoHosts";

const VIEW = "app/_components/Course/components/CourseLearnView/index.tsx";

describe("isAllowedVideoUrl", () => {
	it("matches on the full origin, not the hostname", () => {
		expect(isAllowedVideoUrl("https://www.youtube.com/watch?v=x")).toBe(true);
		expect(isAllowedVideoUrl("https://www.youtube.com:8443/watch?v=x")).toBe(
			false,
		);
	});

	it("rejects an unparseable or relative value", () => {
		for (const url of ["", "not a url", "/uploads/lesson.mp4"]) {
			expect(isAllowedVideoUrl(url), url).toBe(false);
		}
	});
});

/**
 * The DTO is a write control; every row stored before it existed was never
 * parsed by it. These assertions are about the render side, where the fetch
 * actually happens — pinned at the source because the component needs a course,
 * a lesson, a router and a session to mount.
 */
describe("the render side applies both guards (AC 55, 56 render halves)", () => {
	const source = () => readFileSync(VIEW, "utf-8");

	it("gates the <source> element on the host allowlist", () => {
		expect(source()).toMatch(
			/lesson\?\.videoUrl && isAllowedVideoUrl\(lesson\.videoUrl\)/,
		);
	});

	it("gates the resource anchor on the scheme allowlist", () => {
		expect(source()).toMatch(/hasSafeScheme\(resource\.url\)/);
	});

	it("renders no <source> element outside that guard", () => {
		const sources = [...source().matchAll(/<source\s/g)];

		// One <source>, and the guard above is what stands in front of it.
		expect(sources).toHaveLength(1);
	});
});
