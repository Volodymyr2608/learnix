import { useRef } from "react";
import { toast } from "sonner";
import { isAbortError } from "@/lib/guards/isAbortError";
import { isStreamEvent } from "../guards/isStreamEvent";
import type { Message } from "../types";

export const useChatStreaming = (
	updateMessage: (id: string, updater: (m: Message) => Message) => void,
	setCourseGenerationId: (id: string) => void,
) => {
	const abortRef = useRef<AbortController | null>(null);

	const streamAssistantMessage = async (
		payload: { userMessage: string; courseGenerationId?: string },
		messageId: string,
	) => {
		abortRef.current?.abort();
		abortRef.current = new AbortController();

		try {
			const res = await fetch("/api/chat/course", {
				method: "POST",
				body: JSON.stringify(payload),
				signal: abortRef.current.signal,
			});

			if (!res.body) return;

			let buffer = "";
			const reader = res.body.getReader();
			const td = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += td.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;

					const parsed = JSON.parse(line.replace("data: ", ""));

					if (!isStreamEvent(parsed)) return;

					if (parsed.type === "token") {
						updateMessage(messageId, (m) => ({
							...m,
							content: m.content + parsed.value,
						}));
					}

					if (parsed.type === "start") {
						setCourseGenerationId(parsed.courseGenerationId);
					}

					if (parsed.type === "step_committed") {
						updateMessage(messageId, (m) => ({
							...m,
							showActions: true,
							step: parsed.step,
						}));
					}

					if (parsed.type === "error") {
						toast.error(parsed.message);
					}
				}
			}
		} catch (e) {
			if (isAbortError(e)) {
				return;
			}

			if (e instanceof Error) {
				console.error("Streaming error", e);
				toast.error(e.message);
				return;
			}

			console.error("Unknown streaming error", e);
			toast.error("Streaming error");
		} finally {
			updateMessage(messageId, (m) => ({ ...m, isStreaming: false }));
		}
	};

	return { streamAssistantMessage };
};
