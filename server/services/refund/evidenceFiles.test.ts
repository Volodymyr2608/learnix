import { describe, expect, it } from "vitest";
import {
	EVIDENCE_MAX_FILES,
	EVIDENCE_MAX_TOTAL_BYTES,
	validateEvidence,
} from "./evidenceFiles";

const file = (bytes: number[], name: string, type: string, size?: number) => {
	const head = new Uint8Array(bytes);
	const body = new Uint8Array(size ?? head.length);
	body.set(head);
	return new File([body], name, { type });
};

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const SVG = Array.from(
	new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'),
);

describe("validateEvidence (C21, AC-C21, AC-F8)", () => {
	it("accepts PNG, JPEG and PDF by their content", async () => {
		const accepted = await validateEvidence([
			file(PNG, "a.png", "image/png"),
			file(JPEG, "b.jpg", "image/jpeg"),
			file(PDF, "c.pdf", "application/pdf"),
		]);
		expect(accepted.map((f) => f.contentType)).toEqual([
			"image/png",
			"image/jpeg",
			"application/pdf",
		]);
	});

	it("accepts no files", async () => {
		expect(await validateEvidence([])).toEqual([]);
	});

	it("uses the detected type, not the declared one", async () => {
		const [only] = await validateEvidence([
			file(PDF, "looks.png", "image/png"),
		]);
		expect(only?.contentType).toBe("application/pdf");
	});

	it.each([
		["an SVG renamed .png", file(SVG, "x.png", "image/png")],
		[
			"text declared as PDF",
			file([0x68, 0x69, 0x21, 0x0a], "x.pdf", "application/pdf"),
		],
		["an empty file", file([], "x.png", "image/png")],
	])("rejects %s", async (_label, f) => {
		await expect(validateEvidence([f])).rejects.toMatchObject({
			reason: "type",
		});
	});

	it("rejects more than 3 files", async () => {
		const files = Array.from({ length: EVIDENCE_MAX_FILES + 1 }, (_, i) =>
			file(PNG, `${i}.png`, "image/png"),
		);
		await expect(validateEvidence(files)).rejects.toMatchObject({
			reason: "count",
		});
	});

	it("rejects more than 4 MB in total", async () => {
		const half = Math.floor(EVIDENCE_MAX_TOTAL_BYTES / 2);
		await expect(
			validateEvidence([
				file(PNG, "a.png", "image/png", half),
				file(PNG, "b.png", "image/png", EVIDENCE_MAX_TOTAL_BYTES - half + 1),
			]),
		).rejects.toMatchObject({ reason: "size" });
	});
});
