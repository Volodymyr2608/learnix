import { describe, expect, it } from "vitest";
import { CLASS_DENYLIST, isDenylisted } from "./denylist";

describe("isDenylisted", () => {
	it("matches the exact classes it names", () => {
		expect(isDenylisted("UpstashError")).toBe(true);
		expect(isDenylisted("StripeError")).toBe(true);
		expect(isDenylisted("ResendSendError")).toBe(true);
	});

	it("matches every PrismaClient* subclass by prefix", () => {
		// Prisma ships several; the prefix is what makes a new one covered on arrival.
		expect(isDenylisted("PrismaClientKnownRequestError")).toBe(true);
		expect(isDenylisted("PrismaClientValidationError")).toBe(true);
		expect(isDenylisted("PrismaClientUnknownRequestError")).toBe(true);
		expect(isDenylisted("PrismaClientInitializationError")).toBe(true);
	});

	it("does not match unrelated classes", () => {
		expect(isDenylisted("Error")).toBe(false);
		expect(isDenylisted("TRPCError")).toBe(false);
		expect(isDenylisted("CourseError")).toBe(false);
		expect(isDenylisted("OutputParserException")).toBe(false);
	});

	it("is not vacuous", () => {
		expect(CLASS_DENYLIST.length).toBeGreaterThanOrEqual(4);
	});
});
