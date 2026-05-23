import { useRef } from "react";
import { toast } from "sonner";
import { isAbortError } from "@/lib/guards/isAbortError";
import { isStreamEvent, type StreamEvent } from "../guards/isStreamEvent";
import type { Message } from "../types";

type StreamPayload = {
	mode: "chat" | "finalize";
	courseGenerationId?: string;
	userMessage?: string;
};

type Callbacks = {
	updateMessage: (id: string, updater: (m: Message) => Message) => void;
	setCourseGenerationId: (id: string) => void;
	onStreamEvent?: (ev: StreamEvent) => void;
};

export const useChatStreaming = (cb: Callbacks) => {
	const { updateMessage, setCourseGenerationId, onStreamEvent } = cb;
	const abortRef = useRef<AbortController | null>(null);

	const stream = async (payload: StreamPayload, messageId: string) => {
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

					onStreamEvent?.(parsed);

					if (parsed.type === "token") {
						updateMessage(messageId, (m) => ({
							...m,
							content: m.content + parsed.value,
						}));
					}
					if (parsed.type === "start") {
						setCourseGenerationId(parsed.courseGenerationId);
					}
					if (parsed.type === "error") {
						toast.error(parsed.message);
					}
				}
			}
		} catch (e) {
			if (isAbortError(e)) return;
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

	return {
		streamAssistantMessage: (
			payload: { userMessage: string; courseGenerationId?: string },
			messageId: string,
		) =>
			stream(
				{
					mode: "chat",
					userMessage: payload.userMessage,
					courseGenerationId: payload.courseGenerationId,
				},
				messageId,
			),
		streamFinalize: (
			payload: { courseGenerationId: string },
			messageId: string,
		) =>
			stream(
				{ mode: "finalize", courseGenerationId: payload.courseGenerationId },
				messageId,
			),
	};
};