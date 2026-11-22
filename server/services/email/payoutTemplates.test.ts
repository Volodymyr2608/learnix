import { describe, expect, it } from "vitest";
import { renderTemplate } from "./email.renderer";

describe("payout monitoring email templates (FR-A10, FR-A11, M10)", () => {
	it("renders the failed-run alert with the run's error", async () => {
		const out = await renderTemplate("admin.payout-run-failed", {
			runId: "run_1",
			error: "connection lost",
			startedAt: "2026-11-20T03:00:00.000Z",
			panelUrl: "https://learnix.app/admin/payouts",
		});
		expect(out.subject).toMatch(/payout/i);
		expect(out.text).toContain("connection lost");
	});

	it("renders the 48 h alert with and without a last success", async () => {
		for (const lastSuccessAt of ["2026-11-18T03:00:00.000Z", null]) {
			const out = await renderTemplate("admin.payout-stale", {
				lastSuccessAt,
				panelUrl: "https://learnix.app/admin/payouts",
			});
			expect(out.text).toMatch(/48 hours/);
		}
	});

	it("renders the admin's overdue-refund reminder", async () => {
		const out = await renderTemplate("admin.refund-overdue", {
			requestId: "req_1",
			approvedAt: "2026-11-17T10:00:00.000Z",
			panelUrl: "https://learnix.app/admin/payouts",
		});
		expect(out.text).toContain("req_1");
	});

	it("renders the student's notice with no Stripe or error text (C23)", async () => {
		const out = await renderTemplate("refund.still-processing", {
			name: "Ada",
			courseTitle: "Intro to RAG",
		});
		expect(out.text).toContain("still being processed");
		expect(out.text).not.toMatch(/stripe|error|declined/i);
	});

	it("rejects a student payload that tries to carry error text", async () => {
		await expect(
			renderTemplate("refund.still-processing", {
				name: "Ada",
				courseTitle: "Intro",
				error: "card declined",
			}),
		).rejects.toThrow();
	});
});
