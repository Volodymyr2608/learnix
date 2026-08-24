import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 9. No console.* remains in server/** or app/** outside scripts/**.
 * scripts/** is not nested under either root, so it is out of the scanned roots by
 * construction — it keeps console.* for CLI progress output, which is not telemetry
 * (spec.md, functional scope §8).
 *
 * Client Components are also out of scope, by an explicit ruling (not a loophole): this
 * feature is server-side only in v1 — no browser Sentry SDK, no `NEXT_PUBLIC_SENTRY_DSN`
 * (spec.md "Server-side only in v1"; `instrumentation-client.ts` was deliberately deleted
 * in Task 1). `server/utils/logger.ts`'s reporter imports `reportError`, which imports
 * `@sentry/nextjs` — a server-only SDK. Routing a Client Component's `console.error`
 * through `logger` would pull that server-only Sentry code into a browser bundle.
 *
 * Next.js's own boundary primitive is the "use client" directive, checked here as the
 * first statement of the file — the same way Next parses the pragma. That catches every
 * file which is itself the client boundary. It does NOT catch a file with no directive
 * of its own that is nevertheless only ever imported from inside a client subtree (a
 * hook, a plain helper, or a leaf component reached exclusively through a "use client"
 * ancestor) — Next does not require every file in a client subtree to redeclare the
 * pragma. Those are listed explicitly below, each verified by grepping its importer(s)
 * back to a "use client" boundary — not guessed:
 *
 *  - validateProceed.ts       — sole importer UpdateCourseActions/index.tsx, which calls
 *                                useState/useRouter/useFormContext/authClient.useSession.
 *  - uploadMedia.ts            — imported by CreateCourseActions & UpdateCourseActions
 *                                (both client); itself uses `fetch` + sonner's `toast`.
 *  - useChatStreaming.ts       — sole real importer AIChatBuilderDialog/index.tsx, which
 *                                has its own "use client" pragma.
 *  - CreateCourseActions/index.tsx — rendered under CourseBuilder/index.tsx's "use
 *                                client" boundary; itself calls useState/useRouter/
 *                                useFormContext.
 */
const ROOTS = ["server", "app"];

const CLIENT_ONLY_WITHOUT_OWN_PRAGMA = [
	"app/_components/Course/helpers/validateProceed.ts",
	"app/_components/Course/helpers/uploadMedia.ts",
	"app/_components/Course/components/AIChatBuilderDialog/hooks/useChatStreaming.ts",
	"app/_components/Course/components/CreateCourseActions/index.tsx",
];

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

/** Next.js parses this as the first statement of the module. */
const isClientComponent = (file: string): boolean =>
	/^(["'])use client\1/.test(readFileSync(file, "utf-8").trimStart());

const scanTargets = (): string[] =>
	ROOTS.filter((root) => existsSync(root))
		.flatMap((root) => walk(root))
		.filter((f) => !f.endsWith(".test.ts"))
		.filter((f) => !isClientComponent(f))
		.filter((f) => !CLIENT_ONLY_WITHOUT_OWN_PRAGMA.includes(f));

describe("no console.* remains under server/** or app/**, outside Client Components (AC 9)", () => {
	it("no console.* call in any scanned file", () => {
		const offenders = scanTargets().filter((f) => /console\./.test(code(f)));

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("finds files at all — the scan is not vacuous", () => {
		expect(scanTargets().length).toBeGreaterThan(0);
	});

	it("the exemption list is a documented exception, not a hole in the walk", () => {
		const allFiles = new Set([
			...ROOTS.filter((root) => existsSync(root)).flatMap((root) => walk(root)),
		]);
		const exempt = [
			...CLIENT_ONLY_WITHOUT_OWN_PRAGMA,
			"app/_components/Instructor/Reviews/MarkReviewsViewed/index.tsx",
			"app/_components/Instructor/Students/StudentsTable/components/SendMessageMenuItem/index.tsx",
			"app/_components/Messaging/MessageInstructorButton/index.tsx",
			"app/_components/Messaging/MessageStudentButton/index.tsx",
		];

		for (const file of exempt) {
			expect(allFiles.has(file), `expected to walk over ${file}`).toBe(true);
		}
	});
});
