import { describe, expect, it } from "vitest";
import { openAppealWarning } from "./utils";

describe("DangerZoneSection utils (EC-12)", () => {
	it("warns about each open appeal by course", () => {
		expect(openAppealWarning(["Rust"])).toBe(
			"You have an open refund appeal for Rust; deleting your account closes it.",
		);
		expect(openAppealWarning(["Rust", "Go"])).toBe(
			"You have open refund appeals for Rust and Go; deleting your account closes them.",
		);
	});

	it("says nothing without an open appeal", () => {
		expect(openAppealWarning([])).toBeNull();
	});
});
