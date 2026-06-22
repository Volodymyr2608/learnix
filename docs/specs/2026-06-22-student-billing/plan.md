# Student Billing (purchase history) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students a `/dashboard/billing` page listing their purchases (`succeeded` + `refunded`) with a downloadable per-purchase PDF invoice.

**Architecture:** Read-only over the existing `Payment` ledger (no schema change). A new `billing` tRPC router (`studentProcedure`) feeds an RSC page; each row links to `GET /api/invoices/[paymentId]?token=…`, which verifies an HS256 token (new `INVOICE_SECRET`) and streams a react-pdf document. Mirrors the existing certificate feature end-to-end (router → service → repository; signed-token PDF route).

**Tech Stack:** Next.js 16 App Router, tRPC, Prisma, `jose` (JWT), `@react-pdf/renderer`, Vitest, Biome.

## Global Constraints

- **Three-layer pattern:** router → service → repository. No DB access in routers/pages.
- **Statuses shown:** `succeeded` + `refunded` only — `pending`/`failed` never queried or rendered (requirements decision #5, FR3).
- **Token isolation:** invoice tokens use `INVOICE_SECRET`, never `CERTIFICATE_SECRET` (decision #6, FR9).
- **Money:** read `amountCents`/`currency` from the `Payment` row; only *format* for display (`Intl.NumberFormat`), never recompute (NFR).
- **Component conventions:** every component folder has a colocated `types.ts` (all prop types, incl. sub-components); no nested ternaries in JSX (use early-return sub-components); flattened guard states.
- **Formatting/lint:** Biome. Run `pnpm check:write` before each commit; tabs for indentation (match existing files).
- **No schema migration** in this feature.

Task order is dependency-ordered: each task only consumes things produced by an earlier task.

---

### Task 1: Invoice token helpers + `INVOICE_SECRET` env

**Files:**
- Create: `server/services/billing/auth.ts`
- Modify: `lib/env.js` (server schema after line 42 `UNSUBSCRIBE_SECRET`; `runtimeEnv` after line 91)
- Test: `server/services/billing/auth.test.ts`

**Interfaces:**
- Produces: `signInvoiceToken(paymentId: string): Promise<string>` and `verifyInvoiceToken(token: string): Promise<{ paymentId: string }>`.

- [ ] **Step 1: Write the failing test**

Create `server/services/billing/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signInvoiceToken, verifyInvoiceToken } from "./auth";

describe("invoice token", () => {
	it("round-trips a paymentId", async () => {
		const token = await signInvoiceToken("pay-123");
		const payload = await verifyInvoiceToken(token);
		expect(payload.paymentId).toBe("pay-123");
	});

	it("rejects a tampered token", async () => {
		const token = await signInvoiceToken("pay-123");
		const tampered = `${token.slice(0, -2)}xy`;
		await expect(verifyInvoiceToken(tampered)).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- server/services/billing/auth.test.ts`
Expected: FAIL — cannot resolve `./auth`.

- [ ] **Step 3: Add the `INVOICE_SECRET` env var**

In `lib/env.js`, add to the `server:` object directly after the `UNSUBSCRIBE_SECRET` line:

```js
		INVOICE_SECRET: z.string().min(1),
```

And in `runtimeEnv:` directly after the `UNSUBSCRIBE_SECRET` line:

```js
		INVOICE_SECRET: process.env.INVOICE_SECRET,
```

- [ ] **Step 4: Implement the token helpers**

Create `server/services/billing/auth.ts`:

```ts
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

const invoiceSecret = () => new TextEncoder().encode(env.INVOICE_SECRET);

export async function signInvoiceToken(paymentId: string): Promise<string> {
	return new SignJWT({ paymentId })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("30d")
		.sign(invoiceSecret());
}

export async function verifyInvoiceToken(
	token: string,
): Promise<{ paymentId: string }> {
	const { payload } = await jwtVerify(token, invoiceSecret());
	return payload as { paymentId: string };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit -- server/services/billing/auth.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Add `INVOICE_SECRET` to local env files**

Add a non-empty `INVOICE_SECRET=...` to your local `.env` (and `.env.test` if present) so build/dev validation passes. (Tests pass without it because sign+verify share the same key.)

- [ ] **Step 7: Commit**

```bash
pnpm check:write
git add server/services/billing/auth.ts server/services/billing/auth.test.ts lib/env.js
git commit -m "feat(billing): add invoice token helpers and INVOICE_SECRET"
```

---

### Task 2: Payment repository — student purchase + invoice queries

**Files:**
- Modify: `server/repositories/payment.repository.ts` (add two methods inside `PaymentRepository`, after `getRevenueByCourseIds`, before the class closing brace ~line 162)
- Test: `server/repositories/payment.repository.integration.test.ts`

**Interfaces:**
- Produces: `paymentRepository.findPurchasesByStudent(studentId)` → array of `Payment` rows each with `course: { id, title }` and `instructor: { name }`, status in (`succeeded`,`refunded`), ordered `createdAt` desc.
- Produces: `paymentRepository.findInvoiceData(paymentId)` → a `Payment` row with `course: { title }` and `student: { name, email }`, or `null`.

- [ ] **Step 1: Write the failing test**

Create `server/repositories/payment.repository.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";

describe("PaymentRepository.findPurchasesByStudent — integration", () => {
	it("returns only succeeded+refunded for the student, newest first", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR, name: "Ada" });
		const student = await makeUser({ role: Role.STUDENT });
		const other = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Rust 101",
		});

		const base = {
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			currency: "usd",
			amountCents: 4999,
		};
		await testDb.payment.create({
			data: { ...base, status: "succeeded", createdAt: new Date("2026-01-01") },
		});
		await testDb.payment.create({
			data: { ...base, status: "refunded", createdAt: new Date("2026-02-01") },
		});
		await testDb.payment.create({ data: { ...base, status: "pending" } });
		await testDb.payment.create({ data: { ...base, status: "failed" } });
		await testDb.payment.create({
			data: { ...base, studentId: other.id, status: "succeeded" },
		});

		const rows = await paymentRepository.findPurchasesByStudent(student.id);

		expect(rows).toHaveLength(2);
		expect(rows[0]?.status).toBe("refunded"); // newest first
		expect(rows[1]?.status).toBe("succeeded");
		expect(rows[0]?.course.title).toBe("Rust 101");
		expect(rows[0]?.instructor.name).toBe("Ada");
	});

	it("findInvoiceData returns course title and student identity, or null", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT, name: "Bob", email: "bob@x.io" });
		const course = await makeCourse({ instructorId: instructor.id, title: "Go" });
		const payment = await testDb.payment.create({
			data: {
				studentId: student.id,
				instructorId: instructor.id,
				courseId: course.id,
				currency: "usd",
				amountCents: 2000,
				status: "succeeded",
			},
		});

		const found = await paymentRepository.findInvoiceData(payment.id);
		expect(found?.course.title).toBe("Go");
		expect(found?.student.name).toBe("Bob");
		expect(found?.student.email).toBe("bob@x.io");

		expect(await paymentRepository.findInvoiceData("nope")).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- server/repositories/payment.repository.integration.test.ts`
Expected: FAIL — `findPurchasesByStudent is not a function`.

- [ ] **Step 3: Implement the two methods**

In `server/repositories/payment.repository.ts`, add inside the `PaymentRepository` class (after `getRevenueByCourseIds`, before the class closing brace):

```ts
	findPurchasesByStudent(studentId: string) {
		return db.payment.findMany({
			where: { studentId, status: { in: ["succeeded", "refunded"] } },
			include: {
				course: { select: { id: true, title: true } },
				instructor: { select: { name: true } },
			},
			orderBy: { createdAt: "desc" },
		});
	}

	findInvoiceData(paymentId: string) {
		return db.payment.findUnique({
			where: { id: paymentId },
			include: {
				course: { select: { title: true } },
				student: { select: { name: true, email: true } },
			},
		});
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration -- server/repositories/payment.repository.integration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/repositories/payment.repository.ts server/repositories/payment.repository.integration.test.ts
git commit -m "feat(billing): add student purchase and invoice-data payment queries"
```

---

### Task 3: Invoice PDF document component

**Files:**
- Create: `app/_components/Invoice/types.ts`
- Create: `app/_components/Invoice/styles.ts`
- Create: `app/_components/Invoice/index.tsx`
- Create: `app/_components/Invoice/components/InvoiceHeader/index.tsx`
- Create: `app/_components/Invoice/components/InvoiceBody/index.tsx`
- Create: `app/_components/Invoice/components/InvoiceFooter/index.tsx`

**Interfaces:**
- Produces: `InvoiceDocument` (react-pdf `Document`, prop type `InvoiceProps`) — consumed by `billingService.renderInvoicePdf` (Task 4).

> Presentational react-pdf component (like `app/_components/Certificate/`); no unit test. Verified by `pnpm typecheck` here and exercised by Task 4's `renderInvoicePdf` PDF-buffer test.

- [ ] **Step 1: Write the prop types**

Create `app/_components/Invoice/types.ts`:

```ts
export type InvoiceStatus = "succeeded" | "refunded";

export type InvoiceProps = {
	paymentId: string;
	studentName: string;
	studentEmail: string;
	courseTitle: string;
	amountCents: number;
	currency: string;
	status: InvoiceStatus;
	purchasedAt: Date;
};

export type InvoiceBodyProps = {
	studentName: string;
	studentEmail: string;
	courseTitle: string;
	amountCents: number;
	currency: string;
	status: InvoiceStatus;
};

export type InvoiceFooterProps = {
	paymentId: string;
	purchasedAt: Date;
};
```

- [ ] **Step 2: Write the styles**

Create `app/_components/Invoice/styles.ts`:

```ts
import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
	page: {
		flexDirection: "column",
		backgroundColor: "#ffffff",
		padding: 60,
		fontFamily: "Helvetica",
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 40,
	},
	brand: {
		fontSize: 22,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
	},
	headerTitle: {
		fontSize: 16,
		color: "#6B7280",
		textTransform: "uppercase",
		letterSpacing: 2,
	},
	body: {
		flex: 1,
	},
	label: {
		fontSize: 10,
		color: "#9CA3AF",
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 4,
	},
	value: {
		fontSize: 13,
		color: "#111827",
		marginBottom: 16,
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		borderTop: "1px solid #E5E7EB",
		paddingTop: 16,
		marginTop: 8,
	},
	amount: {
		fontSize: 20,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
	},
	refunded: {
		fontSize: 12,
		fontFamily: "Helvetica-Bold",
		color: "#DC2626",
		textTransform: "uppercase",
		letterSpacing: 1,
		marginTop: 4,
	},
	footer: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 40,
		paddingTop: 20,
		borderTop: "1px solid #E5E7EB",
	},
	footerText: {
		fontSize: 10,
		color: "#9CA3AF",
	},
});
```

- [ ] **Step 3: Write the header sub-component**

Create `app/_components/Invoice/components/InvoiceHeader/index.tsx`:

```tsx
import { Text, View } from "@react-pdf/renderer";
import { styles } from "../../styles";

export const InvoiceHeader = () => {
	return (
		<View style={styles.header}>
			<Text style={styles.brand}>Learnix</Text>
			<Text style={styles.headerTitle}>Invoice</Text>
		</View>
	);
};
```

- [ ] **Step 4: Write the body sub-component**

Create `app/_components/Invoice/components/InvoiceBody/index.tsx`:

```tsx
import { Text, View } from "@react-pdf/renderer";
import { styles } from "../../styles";
import type { InvoiceBodyProps } from "../../types";

function formatAmount(amountCents: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);
}

export const InvoiceBody = ({
	studentName,
	studentEmail,
	courseTitle,
	amountCents,
	currency,
	status,
}: InvoiceBodyProps) => {
	return (
		<View style={styles.body}>
			<Text style={styles.label}>Billed to</Text>
			<Text style={styles.value}>
				{studentName} ({studentEmail})
			</Text>

			<Text style={styles.label}>Course</Text>
			<Text style={styles.value}>{courseTitle}</Text>

			<View style={styles.row}>
				<Text style={styles.label}>Total paid</Text>
				<Text style={styles.amount}>{formatAmount(amountCents, currency)}</Text>
			</View>
			{status === "refunded" && <Text style={styles.refunded}>Refunded</Text>}
		</View>
	);
};
```

- [ ] **Step 5: Write the footer sub-component**

Create `app/_components/Invoice/components/InvoiceFooter/index.tsx`:

```tsx
import { Text, View } from "@react-pdf/renderer";
import { styles } from "../../styles";
import type { InvoiceFooterProps } from "../../types";

export const InvoiceFooter = ({ paymentId, purchasedAt }: InvoiceFooterProps) => {
	const dateStr = purchasedAt.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	return (
		<View style={styles.footer}>
			<Text style={styles.footerText}>Date: {dateStr}</Text>
			<Text style={styles.footerText}>Invoice ID: {paymentId}</Text>
		</View>
	);
};
```

- [ ] **Step 6: Write the document root**

Create `app/_components/Invoice/index.tsx`:

```tsx
import { Document, Page } from "@react-pdf/renderer";
import { InvoiceBody } from "./components/InvoiceBody";
import { InvoiceFooter } from "./components/InvoiceFooter";
import { InvoiceHeader } from "./components/InvoiceHeader";
import { styles } from "./styles";
import type { InvoiceProps } from "./types";

export const InvoiceDocument = (props: InvoiceProps) => {
	return (
		<Document>
			<Page size="A4" style={styles.page}>
				<InvoiceHeader />
				<InvoiceBody
					amountCents={props.amountCents}
					courseTitle={props.courseTitle}
					currency={props.currency}
					status={props.status}
					studentEmail={props.studentEmail}
					studentName={props.studentName}
				/>
				<InvoiceFooter
					paymentId={props.paymentId}
					purchasedAt={props.purchasedAt}
				/>
			</Page>
		</Document>
	);
};
```

- [ ] **Step 7: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors in `app/_components/Invoice/**`.

- [ ] **Step 8: Commit**

```bash
pnpm check:write
git add app/_components/Invoice
git commit -m "feat(billing): add Invoice PDF document component"
```

---

### Task 4: Billing entity, errors, and service

**Files:**
- Create: `server/entities/billing/purchase.ts`
- Create: `server/services/billing/billing.errors.ts`
- Create: `server/services/billing/billing.service.ts`
- Test: `server/services/billing/billing.service.integration.test.ts`

**Interfaces:**
- Consumes: `paymentRepository.findPurchasesByStudent`, `paymentRepository.findInvoiceData` (Task 2); `InvoiceDocument` (Task 3).
- Produces: type `StudentPurchase`; `InvoiceNotFoundError`; `billingService.listPurchases(studentId): Promise<StudentPurchase[]>`; `billingService.renderInvoicePdf(paymentId): Promise<Buffer>`.

- [ ] **Step 1: Write the entity**

Create `server/entities/billing/purchase.ts`:

```ts
export type StudentPurchase = {
	paymentId: string;
	courseId: string;
	courseTitle: string;
	instructorName: string;
	amountCents: number;
	currency: string;
	status: "succeeded" | "refunded";
	purchasedAt: Date;
	refundedAt: Date | null;
};
```

- [ ] **Step 2: Write the typed error**

Create `server/services/billing/billing.errors.ts`:

```ts
import { DomainError } from "@/server/services/base/base.errors";

export class InvoiceNotFoundError extends DomainError {
	constructor() {
		super("Payment not found", "NOT_FOUND");
	}
}
```

- [ ] **Step 3: Write the failing test**

Create `server/services/billing/billing.service.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { billingService } from "@/server/services/billing/billing.service";
import { InvoiceNotFoundError } from "@/server/services/billing/billing.errors";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";

describe("BillingService — integration", () => {
	it("listPurchases maps rows to StudentPurchase DTOs", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR, name: "Ada" });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({ instructorId: instructor.id, title: "Rust" });
		await testDb.payment.create({
			data: {
				studentId: student.id,
				instructorId: instructor.id,
				courseId: course.id,
				currency: "usd",
				amountCents: 4999,
				status: "succeeded",
			},
		});

		const out = await billingService.listPurchases(student.id);

		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			courseTitle: "Rust",
			instructorName: "Ada",
			amountCents: 4999,
			currency: "usd",
			status: "succeeded",
		});
		expect(out[0]?.paymentId).toBeTruthy();
	});

	it("renderInvoicePdf returns a PDF buffer for a real payment", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT, name: "Bob", email: "b@x.io" });
		const course = await makeCourse({ instructorId: instructor.id, title: "Go" });
		const payment = await testDb.payment.create({
			data: {
				studentId: student.id,
				instructorId: instructor.id,
				courseId: course.id,
				currency: "usd",
				amountCents: 2000,
				status: "succeeded",
			},
		});

		const buf = await billingService.renderInvoicePdf(payment.id);
		expect(buf).toBeInstanceOf(Buffer);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});

	it("renderInvoicePdf throws InvoiceNotFoundError for a missing payment", async () => {
		await expect(billingService.renderInvoicePdf("missing")).rejects.toBeInstanceOf(
			InvoiceNotFoundError,
		);
	});
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test:integration -- server/services/billing/billing.service.integration.test.ts`
Expected: FAIL — cannot resolve `billing.service`.

- [ ] **Step 5: Implement the service**

Create `server/services/billing/billing.service.ts`:

```ts
import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { InvoiceDocument } from "@/app/_components/Invoice";
import type { StudentPurchase } from "@/server/entities/billing/purchase";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { InvoiceNotFoundError } from "./billing.errors";

class BillingService {
	async listPurchases(studentId: string): Promise<StudentPurchase[]> {
		const rows = await paymentRepository.findPurchasesByStudent(studentId);
		return rows.map((row) => ({
			paymentId: row.id,
			courseId: row.courseId,
			courseTitle: row.course.title,
			instructorName: row.instructor.name,
			amountCents: row.amountCents,
			currency: row.currency,
			status: row.status as "succeeded" | "refunded",
			purchasedAt: row.createdAt,
			refundedAt: row.refundedAt,
		}));
	}

	async renderInvoicePdf(paymentId: string): Promise<Buffer> {
		const payment = await paymentRepository.findInvoiceData(paymentId);
		if (!payment) throw new InvoiceNotFoundError();

		const element = createElement(InvoiceDocument, {
			paymentId: payment.id,
			studentName: payment.student.name,
			studentEmail: payment.student.email,
			courseTitle: payment.course.title,
			amountCents: payment.amountCents,
			currency: payment.currency,
			status: payment.status as "succeeded" | "refunded",
			purchasedAt: payment.createdAt,
		});

		return renderToBuffer(element as ReactElement<DocumentProps>);
	}
}

export const billingService = new BillingService();
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test:integration -- server/services/billing/billing.service.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
pnpm check:write
git add server/entities/billing server/services/billing/billing.service.ts server/services/billing/billing.errors.ts server/services/billing/billing.service.integration.test.ts
git commit -m "feat(billing): add billing service, errors, and StudentPurchase entity"
```

---

### Task 5: Billing tRPC router + registration

**Files:**
- Create: `server/api/routers/billing.ts`
- Modify: `server/api/root.ts` (import + register `billing`)

**Interfaces:**
- Consumes: `billingService.listPurchases` (Task 4).
- Produces: `api.billing.listPurchases()` (`studentProcedure`) → `StudentPurchase[]`.

> Thin transport wrapper. Per repo convention (see `server/api/routers/certificate.ts`, untested), verified by `pnpm typecheck` and exercised end-to-end by the page in Task 8.

- [ ] **Step 1: Write the router**

Create `server/api/routers/billing.ts`:

```ts
import { createTRPCRouter, studentProcedure } from "@/server/api/trpc";
import { billingService } from "@/server/services/billing/billing.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const billingRouter = createTRPCRouter({
	listPurchases: studentProcedure.query(async ({ ctx }) => {
		try {
			return await billingService.listPurchases(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
});
```

- [ ] **Step 2: Register the router**

In `server/api/root.ts`, add the import (alphabetical, after the `analytics` import):

```ts
import { billingRouter } from "@/server/api/routers/billing";
```

And add to the `createTRPCRouter({ ... })` object (after `analytics: analyticsRouter,`):

```ts
	billing: billingRouter,
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors; `api.billing.listPurchases` is now a known procedure.

- [ ] **Step 4: Commit**

```bash
pnpm check:write
git add server/api/routers/billing.ts server/api/root.ts
git commit -m "feat(billing): add billing tRPC router with listPurchases"
```

---

### Task 6: Invoice download route

**Files:**
- Create: `app/api/invoices/[paymentId]/route.ts`
- Test: `app/api/invoices/[paymentId]/route.test.ts`

**Interfaces:**
- Consumes: `verifyInvoiceToken` (Task 1), `billingService.renderInvoicePdf` + `InvoiceNotFoundError` (Task 4).
- Produces: `GET` handler → `200` PDF / `401` / `404`.

- [ ] **Step 1: Write the failing test**

Create `app/api/invoices/[paymentId]/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GET } from "./route";

function makeParams(paymentId: string) {
	return { params: Promise.resolve({ paymentId }) };
}

describe("GET /api/invoices/[paymentId]", () => {
	it("returns 401 when token is missing", async () => {
		const req = new Request("http://localhost/api/invoices/pay-1");
		const res = await GET(req, makeParams("pay-1"));
		expect(res.status).toBe(401);
	});

	it("returns 401 when token is malformed", async () => {
		const req = new Request("http://localhost/api/invoices/pay-1?token=garbage");
		const res = await GET(req, makeParams("pay-1"));
		expect(res.status).toBe(401);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- app/api/invoices/[paymentId]/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement the route**

Create `app/api/invoices/[paymentId]/route.ts`:

```ts
import { verifyInvoiceToken } from "@/server/services/billing/auth";
import { InvoiceNotFoundError } from "@/server/services/billing/billing.errors";
import { billingService } from "@/server/services/billing/billing.service";

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ paymentId: string }> },
) {
	const { paymentId } = await params;
	const token = new URL(req.url).searchParams.get("token");

	if (!token) {
		return new Response("Unauthorized", { status: 401 });
	}

	try {
		const claims = await verifyInvoiceToken(token);
		if (claims.paymentId !== paymentId) {
			return new Response("Unauthorized", { status: 401 });
		}
	} catch {
		return new Response("Unauthorized", { status: 401 });
	}

	try {
		const buf = await billingService.renderInvoicePdf(paymentId);
		return new Response(new Uint8Array(buf), {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="invoice-${paymentId}.pdf"`,
			},
		});
	} catch (e) {
		if (e instanceof InvoiceNotFoundError) {
			return new Response("Not found", { status: 404 });
		}
		throw e;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- app/api/invoices/[paymentId]/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add "app/api/invoices/[paymentId]/route.ts" "app/api/invoices/[paymentId]/route.test.ts"
git commit -m "feat(billing): add token-gated invoice PDF download route"
```

---

### Task 7: Billing list + empty-state components

**Files:**
- Create: `app/_components/Billing/components/BillingHistoryList/types.ts`
- Create: `app/_components/Billing/components/BillingHistoryList/index.tsx`
- Create: `app/_components/Billing/components/BillingEmptyState/index.tsx`

**Interfaces:**
- Consumes: `StudentPurchase` (Task 4).
- Produces: `BillingHistoryList` (default export, prop `items: BillingListItem[]`), `BillingEmptyState` (default export, no props), and type `BillingListItem = StudentPurchase & { invoiceUrl: string }`.

> Presentational components; verified by `pnpm typecheck` + manual page check in Task 8.

- [ ] **Step 1: Write the list types**

Create `app/_components/Billing/components/BillingHistoryList/types.ts`:

```ts
import type { StudentPurchase } from "@/server/entities/billing/purchase";

export type BillingListItem = StudentPurchase & {
	invoiceUrl: string;
};

export type BillingHistoryListProps = {
	items: BillingListItem[];
};

export type PurchaseRowProps = {
	item: BillingListItem;
};

export type StatusBadgeProps = {
	status: BillingListItem["status"];
};
```

- [ ] **Step 2: Write the list component**

Create `app/_components/Billing/components/BillingHistoryList/index.tsx`. Note `PurchaseRow` renders the refunded date when `status === "refunded"` (FR2):

```tsx
import { CalendarDays, Download, RotateCcw, User } from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card, CardContent } from "@/app/_components/_shared/ui/card";
import type {
	BillingHistoryListProps,
	PurchaseRowProps,
	StatusBadgeProps,
} from "@/app/_components/Billing/components/BillingHistoryList/types";

function formatAmount(amountCents: number, currency: string): string {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);
}

function formatDate(date: Date): string {
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function StatusBadge({ status }: StatusBadgeProps) {
	if (status === "refunded") {
		return (
			<Badge
				className="border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
				variant="outline"
			>
				Refunded
			</Badge>
		);
	}
	return (
		<Badge
			className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
			variant="outline"
		>
			Paid
		</Badge>
	);
}

function PurchaseRow({ item }: PurchaseRowProps) {
	return (
		<Card className="overflow-hidden">
			<CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0 space-y-1">
					<div className="flex items-center gap-3">
						<h3 className="truncate font-semibold text-base">
							{item.courseTitle}
						</h3>
						<StatusBadge status={item.status} />
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
						<span className="flex items-center gap-1.5">
							<User className="h-3.5 w-3.5 shrink-0" />
							{item.instructorName}
						</span>
						<span className="flex items-center gap-1.5">
							<CalendarDays className="h-3.5 w-3.5 shrink-0" />
							{formatDate(item.purchasedAt)}
						</span>
						{item.status === "refunded" && item.refundedAt && (
							<span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
								<RotateCcw className="h-3.5 w-3.5 shrink-0" />
								Refunded {formatDate(item.refundedAt)}
							</span>
						)}
					</div>
				</div>
				<div className="flex items-center gap-4 sm:flex-col sm:items-end">
					<span className="font-semibold text-lg">
						{formatAmount(item.amountCents, item.currency)}
					</span>
					<Button asChild size="sm" variant="outline">
						<a download href={item.invoiceUrl}>
							<Download className="h-4 w-4" />
							Invoice
						</a>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

const BillingHistoryList = ({ items }: BillingHistoryListProps) => {
	return (
		<div className="space-y-3">
			{items.map((item) => (
				<PurchaseRow item={item} key={item.paymentId} />
			))}
		</div>
	);
};

export default BillingHistoryList;
```

- [ ] **Step 3: Write the empty state**

Create `app/_components/Billing/components/BillingEmptyState/index.tsx`:

```tsx
import { CreditCard } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";

const BillingEmptyState = () => {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-border border-dashed bg-card py-20 text-center">
			<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
				<CreditCard className="h-8 w-8 text-primary" />
			</div>
			<h2 className="mt-5 font-semibold text-lg">No purchases yet</h2>
			<p className="mt-1.5 max-w-sm text-muted-foreground text-sm">
				When you buy a course, your receipts and invoices will appear here.
			</p>
			<Button asChild className="mt-6">
				<Link href={STUDENT_URLS.browseCourse}>Browse courses</Link>
			</Button>
		</div>
	);
};

export default BillingEmptyState;
```

- [ ] **Step 4: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors in `app/_components/Billing/**`.

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add app/_components/Billing
git commit -m "feat(billing): add billing history list and empty-state components"
```

---

### Task 8: Billing page + docs

**Files:**
- Create: `app/dashboard/billing/page.tsx`
- Modify: `CLAUDE.md` (env table: add `INVOICE_SECRET`; add a Billing note)

**Interfaces:**
- Consumes: `api.billing.listPurchases` (Task 5), `signInvoiceToken` (Task 1), `BillingHistoryList` + `BillingListItem` + `BillingEmptyState` (Task 7).

- [ ] **Step 1: Write the page**

Create `app/dashboard/billing/page.tsx`:

```tsx
import { CreditCard } from "lucide-react";
import BillingEmptyState from "@/app/_components/Billing/components/BillingEmptyState";
import BillingHistoryList from "@/app/_components/Billing/components/BillingHistoryList";
import type { BillingListItem } from "@/app/_components/Billing/components/BillingHistoryList/types";
import { env } from "@/lib/env";
import { signInvoiceToken } from "@/server/services/billing/auth";
import { api } from "@/trpc/server";

export default async function BillingPage() {
	const purchases = await api.billing.listPurchases();

	const items: BillingListItem[] = await Promise.all(
		purchases.map(async (purchase) => {
			const token = await signInvoiceToken(purchase.paymentId);
			return {
				...purchase,
				invoiceUrl: `${env.BASE_URL}/api/invoices/${purchase.paymentId}?token=${token}`,
			};
		}),
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
					<CreditCard className="h-6 w-6" />
				</div>
				<div>
					<h1 className="font-bold text-3xl tracking-tight">Billing</h1>
					<p className="text-muted-foreground">
						Your course purchases and downloadable invoices.
					</p>
				</div>
			</div>
			{items.length === 0 && <BillingEmptyState />}
			{items.length > 0 && <BillingHistoryList items={items} />}
		</div>
	);
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors. (`api.billing.listPurchases()` returns `StudentPurchase[]`.)

- [ ] **Step 3: Manual check**

Run `pnpm dev`, sign in as a student with at least one `succeeded` payment, visit `/dashboard/billing`. Confirm: the row shows course/instructor/date/amount and a "Paid" badge; clicking **Invoice** downloads `invoice-<paymentId>.pdf`; a refunded purchase shows a red "Refunded" badge + refunded date; a student with no payments sees the empty state.

- [ ] **Step 4: Update CLAUDE.md**

In the env-vars table, add a row after `CERTIFICATE_SECRET`:

```
| `INVOICE_SECRET` | Yes | JWT signing secret for billing invoice download tokens |
```

Add a short "Student billing" note near the Certificates section:

> **Student billing:** `billing.listPurchases` (`studentProcedure`) returns the caller's `succeeded`+`refunded` payments. `/dashboard/billing` (RSC) renders them and mints a `signInvoiceToken` per row, linking to `GET /api/invoices/[paymentId]?token=…` (200 PDF / 401 bad token / 404 unknown payment). Invoice PDFs render via `@react-pdf/renderer` (`app/_components/Invoice/`), mirroring the certificate flow. Tokens use `INVOICE_SECRET`, separate from `CERTIFICATE_SECRET`.

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add app/dashboard/billing/page.tsx CLAUDE.md
git commit -m "feat(billing): add /dashboard/billing page and document the feature"
```

---

## Final verification

- [ ] Run the full suite: `pnpm test` — all unit + integration pass.
- [ ] `pnpm typecheck` — clean.
- [ ] `pnpm check` — Biome clean.
- [ ] Manual: list, invoice download, refunded badge + date, and empty state all behave per `validation.md`.