import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LessonContentUpdateDto } from "./index";

const videoUrl = (value: string) =>
	LessonContentUpdateDto.shape.videoUrl.safeParse(value);

const resourceUrl = (value: string) =>
	LessonContentUpdateDto.safeParse({
		id: "lesson-1",
		title: "A lesson",
		resources: [{ id: "r1", name: "Slides", type: "pdf", url: value }],
	});

describe("videoUrl host allowlist (AC 55, DTO half)", () => {
	it("accepts an allowlisted video origin", () => {
		for (const url of [
			"https://www.youtube.com/watch?v=abc",
			"https://youtu.be/abc",
			"https://player.vimeo.com/video/123",
		]) {
			expect(videoUrl(url).success, url).toBe(true);
		}
	});

	it("rejects an origin that is not on the list", () => {
		for (const url of [
			"https://evil.example.com/beacon.mp4",
			"https://cdn.example.com/lesson.mp4",
		]) {
			expect(videoUrl(url).success, url).toBe(false);
		}
	});

	it("still accepts an empty videoUrl, so the field can be cleared", () => {
		expect(videoUrl("").success).toBe(true);
	});

	it("rejects userinfo, homograph and suffix tricks", () => {
		for (const url of [
			// hostname is evil.example; the prefix is credentials, not a host
			"https://www.youtube.com@evil.example/x",
			// Cyrillic о — normalises to punycode, which is not on the ASCII list
			"https://www.yоutube.com/watch?v=x",
			"https://youtube.com.evil.example/x",
		]) {
			expect(videoUrl(url).success, url).toBe(false);
		}
	});

	it("rejects a non-https scheme on an allowlisted host", () => {
		expect(videoUrl("http://www.youtube.com/watch?v=x").success).toBe(false);
	});

	it("caps the field at 2048 characters (AC 57)", () => {
		const long = `https://www.youtube.com/watch?v=${"a".repeat(2048)}`;

		expect(videoUrl(long).success).toBe(false);
	});
});

describe("resources[].url scheme restriction (AC 56, DTO half)", () => {
	it("rejects every disallowed scheme", () => {
		for (const url of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			"data:text/html,x",
			"vbscript:x",
			"blob:https://x/y",
			"file:///etc/passwd",
		]) {
			expect(resourceUrl(url).success, url).toBe(false);
		}
	});

	it("accepts an ordinary off-origin document link", () => {
		expect(resourceUrl("https://example.edu/slides.pdf").success).toBe(true);
		expect(resourceUrl("/uploads/slides.pdf").success).toBe(true);
	});

	it("caps the field at 2048 characters (AC 57)", () => {
		expect(resourceUrl(`https://example.edu/${"a".repeat(2048)}`).success).toBe(
			false,
		);
	});
});

describe("the write path does not spread the DTO (AC 58)", () => {
	it("assigns field by field, so a new DTO key cannot reach the row unreviewed", () => {
		expect(
			readFileSync("server/services/lesson/lesson.service.ts", "utf-8"),
		).not.toMatch(/\.\.\.dto/);
	});
});
