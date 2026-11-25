import { describe, expect, it } from "vitest";
import {
	appealKindLabel,
	approveBlockedText,
	daysLeftLabel,
	snapshotSummary,
} from "./utils";

describe("AppealCard utils (FR-A1)", () => {
	it.each([
		[0, "Deadline passed — still undecided"],
		[1, "1 day left"],
		[6, "6 days left"],
	])("labels %i days left", (days, label) => {
		expect(daysLeftLabel(days)).toBe(label);
	});

	it("names the kind and the exceeded condition", () => {
		expect(appealKindLabel("direct", "threshold")).toBe(
			"Direct appeal — over the opened-lesson limit",
		);
		expect(appealKindLabel("after_denial", "window")).toBe(
			"Appeal after an automatic denial — refund period ended",
		);
	});

	it("summarises the snapshot numbers it has", () => {
		expect(
			snapshotSummary({
				openedCount: 4,
				lessonCount: 6,
				threshold: 3,
				accountLimitRefunds12m: 1,
			}),
		).toBe("Opened 4 of 6 lessons (limit 3) · 1 automatic refund in 12 months");
		expect(snapshotSummary({})).toBe("No snapshot recorded");
	});

	it("explains why approval is unavailable", () => {
		expect(approveBlockedText("certificate")).toBe(
			"Approve is unavailable: the student has the certificate.",
		);
		expect(approveBlockedText("dispute")).toBe(
			"Approve is unavailable: a bank dispute is open.",
		);
		expect(approveBlockedText(null)).toBeNull();
	});
});
