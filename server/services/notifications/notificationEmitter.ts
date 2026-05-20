import { env } from "@/lib/env";
import { logger } from "@/server/utils/logger";
import { signHmac } from "./auth";

type EventType = "certificate.earned" | "progress.near_completion";

const BACKOFF_MS = [1000, 5000, 25000] as const;

async function postWithRetry(
	url: string,
	body: string,
	headers: Record<string, string>,
): Promise<{ ok: boolean; status: number }> {
	for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
		if (attempt > 0) {
			await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
		}
		try {
			const res = await fetch(url, { method: "POST", body, headers });
			if (res.ok) return { ok: true, status: res.status };
			if (attempt === BACKOFF_MS.length) return { ok: false, status: res.status };
		} catch {
			if (attempt === BACKOFF_MS.length) return { ok: false, status: 0 };
		}
	}
	return { ok: false, status: 0 };
}

class NotificationEmitter {
	async emit(type: EventType, payload: object): Promise<void> {
		const eventId = crypto.randomUUID();
		const body = JSON.stringify({
			eventId,
			type,
			occurredAt: new Date().toISOString(),
			...payload,
		});
		const t0 = Date.now();
		const result = await postWithRetry(
			`${env.N8N_WEBHOOK_BASE_URL}/${type}`,
			body,
			{
				"Content-Type": "application/json",
				"X-Learnix-Signature": signHmac(body),
			},
		);
		logger.info("notification_emitter", {
			eventId,
			type,
			status: result.ok ? "sent" : "failed",
			latencyMs: Date.now() - t0,
		});
	}
}

export const notificationEmitter = new NotificationEmitter();