import fs from "node:fs";
import path from "node:path";

const N8N_WEBHOOK_BASE_URL = process.env.N8N_WEBHOOK_BASE_URL;
const N8N_API_TOKEN = process.env.N8N_API_TOKEN;

if (!N8N_WEBHOOK_BASE_URL || !N8N_API_TOKEN) {
	console.error("N8N_WEBHOOK_BASE_URL and N8N_API_TOKEN must be set");
	process.exit(1);
}

const N8N_URL = new URL(N8N_WEBHOOK_BASE_URL).origin.replace(
	"host.docker.internal",
	"localhost",
);
const dir = path.join(process.cwd(), "n8n/workflows");

async function upsertWorkflow(jsonPath: string) {
	const wf = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
		name: string;
		[key: string]: unknown;
	};
	const listRes = await fetch(
		`${N8N_URL}/api/v1/workflows?name=${encodeURIComponent(wf.name)}`,
		{ headers: { "X-N8N-API-KEY": N8N_API_TOKEN! } },
	);
	const list = (await listRes.json()) as { data?: { id: string }[] };
	const existing = list.data?.[0];

	const method = existing ? "PUT" : "POST";
	const url = existing
		? `${N8N_URL}/api/v1/workflows/${existing.id}`
		: `${N8N_URL}/api/v1/workflows`;

	const res = await fetch(url, {
		method,
		headers: {
			"X-N8N-API-KEY": N8N_API_TOKEN!,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(wf),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Failed to upsert ${path.basename(jsonPath)}: ${text}`);
	}

	console.log(`✓ ${path.basename(jsonPath)} (${method})`);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
for (const f of files) {
	await upsertWorkflow(path.join(dir, f));
}
console.log("Done.");