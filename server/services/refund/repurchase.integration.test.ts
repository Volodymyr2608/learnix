import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => flag.on,
}));
const sessionsCreate = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: { checkout: { sessions: { create: sessionsCreate } } },
}));

const callerFor = (id: string, role: Role = Role.STUDENT) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

describe("a repurchase after a refund (FR-S22, FR-S23, AC-F7, EC-17)", () => {
	let studentId: string;
	let instructorId: string;
	let courseId: string;

	const earlier = (
		overrides: Parameters<typeof makePayment>[0] extends infer T
			? Partial<T>
			: never = {},
	) => makePayment({ studentId, instructorId, courseId, ...overrides });

	const warning = async () =>
		(await callerFor(studentId).refund.repurchaseWarning({ courseId }))
			?.notRefundable;

	beforeEach(async () => {
		flag.on = true;
		await truncateAll();
		vi.clearAllMocks();
		sessionsCreate.mockResolvedValue({ id: "cs_new", url: "https://checkout" });
		instructorId = (await makeUser({ role: "INSTRUCTOR" })).id;
		studentId = (await makeUser()).id;
		courseId = (
			await makeCourse({ instructorId, status: "published", priceCents: 4900 })
		).id;
	});

	it("warns after an automatic refund of the course", async () => {
		const payment = await earlier({
			status: "refunded",
			refundedAt: new Date(),
		});
		await makeRefundRequest({ paymentId: payment.id, studentId, courseId });

		expect(await warning()).toBe(true);
	});

	it("warns after a lost dispute", async () => {
		await earlier({
			status: "refunded",
			refundedAt: new Date(),
			refundSource: "lost_dispute",
			disputeState: "lost",
		});

		expect(await warning()).toBe(true);
	});

	it.each([
		"admin_exception",
		"dashboard_refund",
	] as const)("does not warn after a %s", async (refundSource) => {
		await earlier({ status: "refunded", refundedAt: new Date(), refundSource });
		expect(await warning()).toBe(false);
	});

	it("does not warn with the flag off or before any refund", async () => {
		expect(await warning()).toBe(false);
		const payment = await earlier({
			status: "refunded",
			refundedAt: new Date(),
		});
		await makeRefundRequest({ paymentId: payment.id, studentId, courseId });
		flag.on = false;
		expect(await warning()).toBe(false);
	});

	it("refuses a repurchase while a dispute on an earlier payment is open (EC-17)", async () => {
		await earlier({ disputeState: "open" });

		await expect(
			callerFor(studentId).payment.createCheckoutSession({ courseId }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(sessionsCreate).not.toHaveBeenCalled();
	});
});
