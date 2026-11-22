import { describe, expect, it } from "vitest";
import { OUTCOME_LABEL, outcomeDescription } from "./utils";

describe("ResolveBankFailureDialog utils (FR-P27)", () => {
	it("labels both outcomes", () => {
		expect(OUTCOME_LABEL).toEqual({
			refunded_elsewhere: "Refunded another way",
			sale_stands: "The sale stands",
		});
	});

	it("says what each outcome does to the instructor's share", () => {
		expect(outcomeDescription("refunded_elsewhere")).toMatch(
			/share is cancelled/,
		);
		expect(outcomeDescription("sale_stands")).toMatch(/normal release rule/);
	});
});
