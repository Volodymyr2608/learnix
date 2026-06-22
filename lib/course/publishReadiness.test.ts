import { describe, expect, it } from "vitest";
import { getPublishReadiness, type ReadinessInput } from "./publishReadiness";

const complete: ReadinessInput = {
	thumbnailUrl: "https://blob/x.png",
	objectives: ["Learn X"],
	description: "A real description",
	priceCents: 4900,
	sections: [{ lessons: [{}] }],
};

describe("getPublishReadiness", () => {
	it("is ready when every prerequisite is met", () => {
		const r = getPublishReadiness(complete);
		expect(r.ready).toBe(true);
		expect(r.items.every((i) => i.met)).toBe(true);
	});
	it("flags a missing thumbnail", () => {
		const r = getPublishReadiness({ ...complete, thumbnailUrl: null });
		expect(r.ready).toBe(false);
		expect(r.items.find((i) => i.id === "thumbnail")?.met).toBe(false);
	});
	it("flags no objectives, no lessons, empty description", () => {
		const r = getPublishReadiness({
			...complete,
			objectives: [],
			description: "  ",
			sections: [{ lessons: [] }],
		});
		expect(r.items.find((i) => i.id === "objectives")?.met).toBe(false);
		expect(r.items.find((i) => i.id === "lessons")?.met).toBe(false);
		expect(r.items.find((i) => i.id === "description")?.met).toBe(false);
	});
	it("treats a free (0) price as acknowledged", () => {
		const r = getPublishReadiness({ ...complete, priceCents: 0 });
		expect(r.items.find((i) => i.id === "price")?.met).toBe(true);
	});
});
