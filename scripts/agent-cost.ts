/**
 * Agent cost report (ADR-030, task A0).
 *
 * Reads this project's Claude Code transcripts and answers three questions the
 * development process could not answer before:
 *
 *   1. What does one feature cost, in tokens?
 *   2. How much of that goes to subagents rather than the main session?
 *   3. Which subagent type earns its cost?
 *
 * Usage:
 *   pnpm agent-cost                      # every session, grouped by branch
 *   pnpm agent-cost --branch feat/x      # one branch
 *   pnpm agent-cost --since 2026-07-01   # sessions started on/after a date
 *   pnpm agent-cost --json               # machine-readable
 *
 * Transcript layout (verified 2026-08-25):
 *   ~/.claude/projects/<slug>/<session>.jsonl              main session
 *   ~/.claude/projects/<slug>/<session>/subagents/agent-<id>.jsonl
 *
 * A dispatch is an `Agent` tool_use carrying `input.subagent_type`; its
 * tool_result text carries `agentId: <id>`, which names the subagent file.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

/**
 * Cache-aware weighting, not dollars. A cache read bills at roughly a tenth of
 * a fresh input token and a cache write at roughly 1.25x, so raw token counts
 * flatter a cold-subagent topology and punish a warm one. Weighted units are
 * what make the two comparable. Edit these if the ratios change.
 */
const WEIGHT = {
	input: 1,
	cacheCreation: 1.25,
	cacheRead: 0.1,
	output: 1,
} as const;

type Usage = {
	input: number;
	cacheCreation: number;
	cacheRead: number;
	output: number;
};

type Dispatch = {
	agentType: string;
	agentId: string;
	model: string;
	spawnDepth: number;
	usage: Usage;
};

/** Sidecar written next to each subagent transcript — the authoritative attribution. */
type AgentMeta = {
	agentType?: string;
	description?: string;
	toolUseId?: string;
	spawnDepth?: number;
	model?: string;
};

type Session = {
	id: string;
	branches: Set<string>;
	startedAt: string | undefined;
	main: Usage;
	dispatches: Dispatch[];
};

const emptyUsage = (): Usage => ({
	input: 0,
	cacheCreation: 0,
	cacheRead: 0,
	output: 0,
});

function addUsage(target: Usage, source: Usage): void {
	target.input += source.input;
	target.cacheCreation += source.cacheCreation;
	target.cacheRead += source.cacheRead;
	target.output += source.output;
}

function weighted(usage: Usage): number {
	return Math.round(
		usage.input * WEIGHT.input +
			usage.cacheCreation * WEIGHT.cacheCreation +
			usage.cacheRead * WEIGHT.cacheRead +
			usage.output * WEIGHT.output,
	);
}

function rawTokens(usage: Usage): number {
	return usage.input + usage.cacheCreation + usage.cacheRead + usage.output;
}

/** `/home/x/y` → `-home-x-y`, the slug Claude Code uses for the project dir. */
function projectSlug(cwd: string): string {
	return cwd.replace(/[/.]/g, "-");
}

async function eachRecord(
	file: string,
	visit: (record: Record<string, unknown>) => void,
): Promise<void> {
	const stream = readline.createInterface({
		input: fs.createReadStream(file, "utf-8"),
		crlfDelay: Number.POSITIVE_INFINITY,
	});
	for await (const line of stream) {
		if (!line) continue;
		try {
			visit(JSON.parse(line) as Record<string, unknown>);
		} catch {
			// A truncated trailing line in a live session is expected, not an error.
		}
	}
}

function usageFrom(record: Record<string, unknown>): Usage | undefined {
	const message = record.message as
		| { usage?: Record<string, number> }
		| undefined;
	const usage = message?.usage;
	if (!usage) return undefined;
	return {
		input: usage.input_tokens ?? 0,
		cacheCreation: usage.cache_creation_input_tokens ?? 0,
		cacheRead: usage.cache_read_input_tokens ?? 0,
		output: usage.output_tokens ?? 0,
	};
}

type ContentBlock = {
	type?: string;
	name?: string;
	id?: string;
	tool_use_id?: string;
	input?: { subagent_type?: string };
	content?: unknown;
};

function contentBlocks(record: Record<string, unknown>): ContentBlock[] {
	const message = record.message as { content?: unknown } | undefined;
	return Array.isArray(message?.content)
		? (message.content as ContentBlock[])
		: [];
}

/** The launch result carries `agentId: <id>`, naming the subagent transcript. */
function agentIdFromResult(block: ContentBlock): string | undefined {
	const parts = Array.isArray(block.content) ? block.content : [];
	for (const part of parts as { text?: string }[]) {
		const match = /agentId:\s*([a-z0-9]+)/i.exec(part.text ?? "");
		if (match) return match[1];
	}
	return undefined;
}

function readMeta(subagentDir: string, agentId: string): AgentMeta {
	const metaPath = path.join(subagentDir, `agent-${agentId}.meta.json`);
	if (!fs.existsSync(metaPath)) return {};
	try {
		return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as AgentMeta;
	} catch {
		return {};
	}
}

async function readSession(dir: string, file: string): Promise<Session> {
	const id = path.basename(file, ".jsonl");
	const session: Session = {
		id,
		branches: new Set(),
		startedAt: undefined,
		main: emptyUsage(),
		dispatches: [],
	};

	// toolUseId → subagent_type, resolved to an agentId when the result arrives.
	const pendingType = new Map<string, string>();
	const typeByAgentId = new Map<string, string>();

	await eachRecord(path.join(dir, file), (record) => {
		const branch = record.gitBranch;
		if (typeof branch === "string" && branch) session.branches.add(branch);
		const timestamp = record.timestamp;
		if (typeof timestamp === "string" && !session.startedAt)
			session.startedAt = timestamp;

		const usage = usageFrom(record);
		if (usage) addUsage(session.main, usage);

		for (const block of contentBlocks(record)) {
			if (block.type === "tool_use" && block.input?.subagent_type && block.id) {
				pendingType.set(block.id, block.input.subagent_type);
			}
			if (block.type === "tool_result" && block.tool_use_id) {
				const agentType = pendingType.get(block.tool_use_id);
				const agentId = agentIdFromResult(block);
				if (agentType && agentId) typeByAgentId.set(agentId, agentType);
			}
		}
	});

	const subagentDir = path.join(dir, id, "subagents");
	if (fs.existsSync(subagentDir)) {
		for (const entry of fs.readdirSync(subagentDir)) {
			if (!entry.endsWith(".jsonl")) continue;
			const agentId = entry.replace(/^agent-/, "").replace(/\.jsonl$/, "");
			const usage = emptyUsage();
			await eachRecord(path.join(subagentDir, entry), (record) => {
				const recordUsage = usageFrom(record);
				if (recordUsage) addUsage(usage, recordUsage);
			});
			// The sidecar is authoritative; the parent-transcript map only covers
			// async launches, which announce an agentId in their tool_result.
			const meta = readMeta(subagentDir, agentId);
			session.dispatches.push({
				agentType:
					meta.agentType ?? typeByAgentId.get(agentId) ?? "(unattributed)",
				agentId,
				model: meta.model ?? "(inherited)",
				spawnDepth: meta.spawnDepth ?? 1,
				usage,
			});
		}
	}

	return session;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid] as number;
	return Math.round(
		((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2,
	);
}

function fmt(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
	return String(value);
}

function pct(part: number, whole: number): string {
	if (whole === 0) return "—";
	return `${Math.round((part / whole) * 100)}%`;
}

function table(header: string[], rows: string[][]): string {
	const widths = header.map((cell, index) =>
		Math.max(cell.length, ...rows.map((row) => (row[index] ?? "").length)),
	);
	const line = (cells: string[]) =>
		cells.map((cell, index) => cell.padEnd(widths[index] as number)).join("  ");
	return [
		line(header),
		line(widths.map((w) => "─".repeat(w))),
		...rows.map(line),
	].join("\n");
}

type Options = {
	branch: string | undefined;
	since: string | undefined;
	json: boolean;
};

function parseArgs(argv: string[]): Options {
	const options: Options = { branch: undefined, since: undefined, json: false };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--json") options.json = true;
		if (arg === "--branch") {
			options.branch = argv[index + 1];
			index += 1;
		}
		if (arg === "--since") {
			options.since = argv[index + 1];
			index += 1;
		}
	}
	return options;
}

function reportByBranch(sessions: Session[]): string {
	const byBranch = new Map<
		string,
		{ main: Usage; sub: Usage; dispatches: number }
	>();
	for (const session of sessions) {
		// A session that switched branches is attributed to each branch it touched;
		// the total row below counts it once, so branch rows can exceed the total.
		const branches =
			session.branches.size > 0 ? [...session.branches] : ["(no branch)"];
		for (const branch of branches) {
			const entry = byBranch.get(branch) ?? {
				main: emptyUsage(),
				sub: emptyUsage(),
				dispatches: 0,
			};
			addUsage(entry.main, session.main);
			for (const dispatch of session.dispatches)
				addUsage(entry.sub, dispatch.usage);
			entry.dispatches += session.dispatches.length;
			byBranch.set(branch, entry);
		}
	}

	const rows = [...byBranch.entries()]
		.map(([branch, entry]) => ({
			branch,
			total: weighted(entry.main) + weighted(entry.sub),
			main: weighted(entry.main),
			sub: weighted(entry.sub),
			dispatches: entry.dispatches,
		}))
		.sort((a, b) => b.total - a.total)
		.map((row) => [
			row.branch,
			fmt(row.total),
			fmt(row.main),
			fmt(row.sub),
			pct(row.sub, row.total),
			String(row.dispatches),
		]);

	return table(
		["branch", "weighted", "main", "subagents", "sub %", "dispatches"],
		rows,
	);
}

function reportByAgent(sessions: Session[]): string {
	const byType = new Map<string, { costs: number[]; models: Set<string> }>();
	for (const session of sessions) {
		for (const dispatch of session.dispatches) {
			const bucket = byType.get(dispatch.agentType) ?? {
				costs: [],
				models: new Set<string>(),
			};
			bucket.costs.push(weighted(dispatch.usage));
			bucket.models.add(dispatch.model);
			byType.set(dispatch.agentType, bucket);
		}
	}

	const grandTotal = [...byType.values()].reduce(
		(sum, bucket) => sum + bucket.costs.reduce((a, b) => a + b, 0),
		0,
	);

	const rows = [...byType.entries()]
		.map(([agentType, bucket]) => ({
			agentType,
			models: [...bucket.models].sort().join(", "),
			dispatches: bucket.costs.length,
			total: bucket.costs.reduce((a, b) => a + b, 0),
			median: median(bucket.costs),
		}))
		.sort((a, b) => b.total - a.total)
		.map((row) => [
			row.agentType,
			row.models,
			String(row.dispatches),
			fmt(row.total),
			fmt(row.median),
			pct(row.total, grandTotal),
		]);

	return table(
		[
			"subagent type",
			"model",
			"dispatches",
			"weighted total",
			"median/dispatch",
			"share",
		],
		rows,
	);
}

function reportTotals(sessions: Session[]): string {
	const main = emptyUsage();
	const sub = emptyUsage();
	let dispatches = 0;
	for (const session of sessions) {
		addUsage(main, session.main);
		for (const dispatch of session.dispatches) addUsage(sub, dispatch.usage);
		dispatches += session.dispatches.length;
	}
	const all = emptyUsage();
	addUsage(all, main);
	addUsage(all, sub);

	const cacheShare = pct(all.cacheRead, rawTokens(all) - all.output);
	const subShare = pct(weighted(sub), weighted(main) + weighted(sub));

	return [
		`sessions        ${sessions.length}`,
		`dispatches      ${dispatches}`,
		`raw tokens      ${fmt(rawTokens(all))}`,
		`weighted units  ${fmt(weighted(all))}  (main ${fmt(weighted(main))} · subagents ${fmt(weighted(sub))} = ${subShare})`,
		`cache read      ${fmt(all.cacheRead)} of ${fmt(rawTokens(all) - all.output)} input = ${cacheShare} — higher is a warmer topology`,
	].join("\n");
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const dir = path.join(
		os.homedir(),
		".claude/projects",
		projectSlug(process.cwd()),
	);

	if (!fs.existsSync(dir)) {
		console.error(`No transcripts for this project at ${dir}`);
		process.exit(1);
	}

	const files = fs.readdirSync(dir).filter((entry) => entry.endsWith(".jsonl"));
	let sessions = await Promise.all(files.map((file) => readSession(dir, file)));

	if (options.branch) {
		sessions = sessions.filter((session) =>
			session.branches.has(options.branch as string),
		);
	}
	if (options.since) {
		sessions = sessions.filter(
			(session) => (session.startedAt ?? "") >= (options.since as string),
		);
	}

	if (sessions.length === 0) {
		console.error("No sessions matched the filters.");
		process.exit(1);
	}

	if (options.json) {
		console.log(
			JSON.stringify(
				sessions.map((session) => ({
					...session,
					branches: [...session.branches],
				})),
				null,
				2,
			),
		);
		return;
	}

	console.log(`\nAgent cost — ${path.basename(process.cwd())}\n`);
	console.log(reportTotals(sessions));
	console.log(`\nBy branch\n`);
	console.log(reportByBranch(sessions));
	console.log(`\nBy subagent type\n`);
	console.log(reportByAgent(sessions));
	console.log(
		`\nWeighted units apply ${WEIGHT.cacheRead}x to cache reads and ${WEIGHT.cacheCreation}x to cache writes,` +
			`\nso a warm session and a cold subagent are comparable. Raw tokens are reported above them.\n`,
	);
}

void main();
