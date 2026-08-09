import { describe, expect, it } from "vitest";
import { offTopicMessage } from "./messages";

describe("offTopicMessage", () => {
	it("names the subject unchanged when it carries no markup", () => {
		expect(offTopicMessage('the "Intro to Python" course')).toBe(
			'I can only help with questions related to the "Intro to Python" course.',
		);
	});

	// An instructor names a course so the refusal that quotes it renders an image
	// the browser fetches with no click. The refusal is persisted, so it re-fires
	// on every visit, and it never passes through validateReply.
	it("neutralizes a markdown image planted in the course title", () => {
		const message = offTopicMessage(
			'the "Course![](https://evil.example.com/x)" course',
		);

		expect(message).not.toContain("](https://evil.example.com/x)");
		expect(message).toContain("\\!\\[\\]\\(https://evil.example.com/x\\)");
	});

	it("neutralizes an autolink planted in the course title", () => {
		const message = offTopicMessage(
			'the "Course <https://evil.example.com/x>" course',
		);

		expect(message).not.toContain("<https://evil.example.com/x>");
	});
});
