import { describe, expect, it } from "vitest";
import { APPEAL_ACCEPT, appealErrorMessage, MAX_APPEAL_FILES } from "./utils";

describe("AppealForm utils (FR-S15)", () => {
	it("accepts PNG, JPEG and PDF, at most 3 files", () => {
		expect(APPEAL_ACCEPT).toBe("image/png,image/jpeg,application/pdf");
		expect(MAX_APPEAL_FILES).toBe(3);
	});

	it.each([
		[413, undefined, "The files are too large (4 MB in total at most)."],
		[415, undefined, "Only PNG, JPEG or PDF files can be attached."],
		[429, undefined, "Too many attempts. Please try again in a minute."],
		[409, "The appeal period has ended.", "The appeal period has ended."],
		[500, undefined, "The appeal could not be sent. Please try again."],
	])("explains a %i", (status, serverMessage, expected) => {
		expect(appealErrorMessage(status, serverMessage)).toBe(expected);
	});
});
