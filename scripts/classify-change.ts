/**
 * Track classifier (ADR-030, task A1).
 *
 * Decides whether a change introduces **new authority** — the trigger for the
 * `guarded` track (threat pass, ADR, scoped auditors). That question used to be
 * re-derived by a model three separate times, at /spec, /plan and /qa, each time
 * with no memory of the other two and each time defaulting to "run everything".
 * It is mechanical, so it is decided here once instead.
 *
 * What the classifier is authoritative about: guarded or not. The
 * direct-vs-standard split turns on whether a feature's *documented behavior*
 * changes, which no diff can tell you, so it reports signals and leaves that
 * call to the developer.
 *
 * Usage:
 *   pnpm classify                      # working tree, against origin/main
 *   pnpm classify <base>               # against any ref (branch, tag, SHA)
 *   pnpm classify <base> --head <ref>  # a historical range, for back-testing
 *   pnpm classify --json
 */

import { execFileSync } from "node:child_process";

/**
 * `authority` — the change hands the system a power it did not have.
 * `control`   — the change alters a boundary that already exists.
 *
 * They are separate because they need different audits. New authority needs the
 * whole threat pass; a modified control needs one auditor pointed at that
 * control. Back-testing found this: the multilingual guard work (ADR-028) added
 * no authority at all, yet rewrote the L1 pattern set — an authority-only
 * classifier called it unguarded and would have skipped the audit that mattered.
 */
type SignalKind = "authority" | "control";

type Signal = {
	id: string;
	kind: SignalKind;
	label: string;
	/** Files matching this pattern are inspected; undefined means any path. */
	pathTest: (file: string) => boolean;
	/** When set, the signal needs an ADDED line matching this — not just a touch. */
	addedLine?: RegExp;
	/** When true, the signal only fires for a newly added file. */
	newFileOnly?: boolean;
};

/**
 * Each entry answers "does this diff hand the system a power it did not have?"
 * A change *inside* an existing power is not new authority — that is the whole
 * point of the trigger, and why it is "introduces", not "touches".
 */
const AUTHORITY_SIGNALS: Signal[] = [
	{
		id: "agent-tool",
		kind: "authority",
		label: "new agent tool — new authority for a model to act",
		pathTest: (f) => /^server\/services\/.+\/tools\/.+\.tool\.ts$/.test(f),
		newFileOnly: true,
	},
	{
		id: "graph-node",
		kind: "authority",
		label: "new graph node — a new step in an AI flow",
		pathTest: (f) => /^server\/services\/.+graph.*\.ts$/.test(f),
		addedLine: /\.addNode\(\s*"/,
	},
	{
		id: "ai-entry-point",
		kind: "authority",
		label: "new guarded AI entry point",
		pathTest: (f) => f === "server/services/_shared/aiGuard/entryPoints.ts",
		addedLine: /^\s*"/,
	},
	{
		id: "trpc-procedure",
		kind: "authority",
		label: "new tRPC procedure — a new callable surface",
		pathTest: (f) => /^server\/api\/routers\/.+\.ts$/.test(f),
		addedLine:
			/^\s*\w+:\s*(public|protected|instructor|student|admin)Procedure\b/,
	},
	{
		id: "route-handler",
		kind: "authority",
		label: "new app route handler",
		pathTest: (f) => /^app\/api\/.+\/route\.ts$/.test(f),
		newFileOnly: true,
	},
	{
		id: "prisma-model",
		kind: "authority",
		label: "new database model — a new class of stored data",
		pathTest: (f) => /^prisma\/schema\/.+\.prisma$/.test(f),
		addedLine: /^\s*model\s+\w+\s*\{/,
	},
	{
		id: "migration",
		kind: "authority",
		label: "database migration",
		pathTest: (f) => /^prisma\/migrations\//.test(f),
		newFileOnly: true,
	},
	{
		id: "env-var",
		kind: "authority",
		label: "new environment variable — usually a new external service",
		pathTest: (f) => f === "lib/env.js",
		addedLine: /^\s*[A-Z][A-Z0-9_]+:\s/,
	},
	{
		id: "money",
		kind: "authority",
		label: "money path",
		pathTest: (f) =>
			/^server\/services\/(payments|billing)\//.test(f) ||
			/^app\/api\/stripe\//.test(f),
	},
	{
		id: "ai-guard",
		kind: "control",
		label: "changes the shared AI guard (L1 patterns, L2 relevance, wrapping)",
		pathTest: (f) =>
			/^server\/services\/_shared\/aiGuard\//.test(f) && !/\.test\.ts$/.test(f),
	},
	{
		id: "ai-output-boundary",
		kind: "control",
		label: "changes an AI output boundary",
		pathTest: (f) =>
			(/^server\/services\/_shared\/aiOutput\//.test(f) ||
				/outputBoundary.*\.ts$/.test(f) ||
				/validateReply\.ts$/.test(f)) &&
			!/\.test\.ts$/.test(f),
	},
	{
		id: "tool-authority",
		kind: "control",
		label: "changes a tool authority check",
		pathTest: (f) =>
			/toolPolicy\.ts$/.test(f) || /toolArguments.*\.ts$/.test(f),
	},
	{
		id: "authz",
		kind: "control",
		label: "changes procedure-level authorization or the auth layer",
		pathTest: (f) =>
			f === "server/api/trpc.ts" ||
			(/^server\/better-auth\//.test(f) && !/\.test\.ts$/.test(f)),
	},
];

type Finding = {
	signal: Signal;
	files: string[];
};

function git(args: string[]): string {
	return execFileSync("git", args, {
		encoding: "utf-8",
		maxBuffer: 64 * 1024 * 1024,
	});
}

function resolveBase(explicit: string | undefined): string {
	if (explicit) return explicit;
	for (const candidate of ["origin/main", "main"]) {
		try {
			return git(["merge-base", "HEAD", candidate]).trim();
		} catch {
			// Not every clone has an origin; fall through to the next candidate.
		}
	}
	return "HEAD";
}

/**
 * `git diff <base>` with no second ref compares against the working tree, which
 * silently turns a failed checkout into a diff spanning months. Passing the head
 * explicitly is what makes back-testing against history trustworthy.
 */
function range(base: string, head: string | undefined): string[] {
	return head ? [base, head] : [base];
}

/** Added lines only — a removal or a context line never grants authority. */
function addedLines(
	base: string,
	head: string | undefined,
	file: string,
): string[] {
	const diff = git(["diff", "--unified=0", ...range(base, head), "--", file]);
	return diff
		.split("\n")
		.filter((line) => line.startsWith("+") && !line.startsWith("+++"))
		.map((line) => line.slice(1));
}

type ChangedFile = { path: string; added: boolean };

function changedFiles(base: string, head: string | undefined): ChangedFile[] {
	const raw = git(["diff", "--name-status", ...range(base, head)]);
	const files: ChangedFile[] = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		const [status, ...rest] = line.split("\t");
		const filePath = rest[rest.length - 1];
		if (!status || !filePath) continue;
		files.push({ path: filePath, added: status.startsWith("A") });
	}
	return files;
}

function findAuthority(
	base: string,
	head: string | undefined,
	files: ChangedFile[],
): Finding[] {
	const findings: Finding[] = [];
	for (const signal of AUTHORITY_SIGNALS) {
		const matched: string[] = [];
		for (const file of files) {
			if (!signal.pathTest(file.path)) continue;
			if (signal.newFileOnly && !file.added) continue;
			if (signal.addedLine) {
				const hit = addedLines(base, head, file.path).some((line) =>
					(signal.addedLine as RegExp).test(line),
				);
				if (!hit) continue;
			}
			matched.push(file.path);
		}
		if (matched.length > 0) findings.push({ signal, files: matched });
	}
	return findings;
}

/** Hints for the direct-vs-standard call, which a diff cannot settle on its own. */
function behaviourHints(files: ChangedFile[]): string[] {
	const hints: string[] = [];
	const source = files.filter((f) => /^(app|server|lib|trpc)\//.test(f.path));
	const tests = source.filter((f) => /\.test\.ts$/.test(f.path));
	const specs = files.filter((f) => /^docs\/specs\/features\//.test(f.path));

	if (source.length === 0)
		hints.push("no source changed — documentation or config only");
	else if (tests.length === source.length)
		hints.push("only test files changed — no production behavior");
	if (specs.length > 0)
		hints.push(
			`touches ${specs.length} spec file(s) — a documented behavior is in play`,
		);
	if (source.length > 0 && specs.length === 0)
		hints.push(
			"source changed but no spec touched — either a fix, or a missing spec update",
		);
	return hints;
}

function main(): void {
	const argv = process.argv.slice(2);
	const json = argv.includes("--json");
	const headIndex = argv.indexOf("--head");
	const head = headIndex === -1 ? undefined : argv[headIndex + 1];
	const positional = argv.filter(
		(arg, index) => !arg.startsWith("--") && index !== headIndex + 1,
	);
	const base = resolveBase(positional[0]);
	const files = changedFiles(base, head);

	if (files.length === 0) {
		console.log(`No changes against ${base.slice(0, 12)}.`);
		return;
	}

	const findings = findAuthority(base, head, files);
	const track = findings.length > 0 ? "guarded" : "standard-or-direct";
	const hints = behaviourHints(files);

	if (json) {
		console.log(
			JSON.stringify(
				{
					base,
					track,
					changedFiles: files.length,
					authority: findings.map((f) => ({
						id: f.signal.id,
						label: f.signal.label,
						files: f.files,
					})),
					hints,
				},
				null,
				2,
			),
		);
		return;
	}

	console.log(`\nbase           ${base.slice(0, 12)}`);
	console.log(`changed files  ${files.length}`);
	console.log(`track          ${track.toUpperCase()}\n`);

	const authority = findings.filter((f) => f.signal.kind === "authority");
	const controls = findings.filter((f) => f.signal.kind === "control");

	const printGroup = (heading: string, group: Finding[]) => {
		if (group.length === 0) return;
		console.log(heading);
		for (const finding of group) {
			console.log(`  • ${finding.signal.label}`);
			for (const file of finding.files) console.log(`      ${file}`);
		}
		console.log("");
	};

	printGroup("New authority introduced:", authority);
	printGroup("Existing controls modified:", controls);

	if (authority.length > 0) {
		console.log(
			"Guarded: full threat pass at /spec, auditors at /qa scoped to the files above,\n" +
				"ADR if the change passes the three-month test.",
		);
	} else if (controls.length > 0) {
		console.log(
			"Guarded (control change): no new authority, so skip the design pass — point one\n" +
				"auditor at the modified control, and require a false-positive check on legitimate\n" +
				"input, not only a recall check.",
		);
	} else {
		console.log(
			"No new authority and no control touched — the guarded track does not apply.",
		);
		console.log(
			"Controls for surfaces already covered are inherited by reference.",
		);
	}

	if (hints.length > 0) {
		console.log(
			"\nFor the direct-vs-standard call (a diff cannot settle this):",
		);
		for (const hint of hints) console.log(`  – ${hint}`);
	}
	console.log("");
}

main();
