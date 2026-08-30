import { useRef, useState } from "react";
import { api } from "trpc/client";
import { isAbortError } from "@/lib/guards/isAbortError";
import type { ConceptCheckPublic } from "@/server/repositories/conceptCheck.repository";

type Message = {
	id: string;
	role: "user" | "assistant";
	content: string;
	isStreaming?: boolean;
};

export function useLessonAssistant(lessonId: string) {
	const utils = api.useUtils();
	const { data: history = [] } = api.lessonAssistant.getHistory.useQuery({
		lessonId,
	});

	const clearHistoryMutation = api.lessonAssistant.clearHistory.useMutation({
		onSuccess: () => {
			void utils.lessonAssistant.getHistory.invalidate({ lessonId });
			setLiveMessages([]);
		},
	});

	const [liveMessages, setLiveMessages] = useState<Message[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	const allMessages: Message[] = [
		...history.map((m: { id: string; role: string; content: string }) => ({
			id: m.id,
			role: m.role as "user" | "assistant",
			content: m.content,
		})),
		...liveMessages,
	];

	const sendMessage = async (content: string) => {
		if (isLoading || !content.trim()) return;

		const userMsg: Message = {
			id: crypto.randomUUID(),
			role: "user",
			content: content.trim(),
		};
		const assistantMsg: Message = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: "",
			isStreaming: true,
		};

		setLiveMessages((prev) => [...prev, userMsg, assistantMsg]);
		setIsLoading(true);
		abortRef.current?.abort();
		abortRef.current = new AbortController();

		try {
			const res = await fetch("/api/chat/lesson", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ lessonId, message: content.trim() }),
				signal: abortRef.current.signal,
			});

			if (!res.body) return;

			const reader = res.body.getReader();
			const td = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += td.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const parsed = JSON.parse(line.slice(6)) as {
						type: string;
						value?: string;
						message?: string;
						check?: ConceptCheckPublic;
					};

					if (parsed.type === "token" && parsed.value) {
						setLiveMessages((prev) => {
							const last = prev[prev.length - 1];
							if (!last || last.role !== "assistant") return prev;
							return [
								...prev.slice(0, -1),
								{ ...last, content: last.content + parsed.value },
							];
						});
					}

					if (parsed.type === "off_topic" && parsed.message) {
						const message = parsed.message;
						setLiveMessages((prev) => {
							const last = prev[prev.length - 1];
							if (!last || last.role !== "assistant") return prev;
							return [...prev.slice(0, -1), { ...last, content: message }];
						});
					}

					if (parsed.type === "guard_blocked" && parsed.message) {
						const message = parsed.message;
						setLiveMessages((prev) => {
							const last = prev[prev.length - 1];
							if (!last || last.role !== "assistant") return prev;
							return [...prev.slice(0, -1), { ...last, content: message }];
						});
						// Return before the `done` handler below: a blocked turn persists
						// nothing server-side (by design — see ADR-022), so clearing
						// liveMessages and refetching history would erase both the refusal
						// and the student's own message. Mirrors useChatStreaming.
						return;
					}

					if (parsed.type === "retract" && parsed.message) {
						const message = parsed.message;
						setLiveMessages((prev) => {
							const last = prev[prev.length - 1];
							if (!last || last.role !== "assistant") return prev;
							return [...prev.slice(0, -1), { ...last, content: message }];
						});
						// The reply failed output validation server-side. Tokens already
						// arrived, so replace them; nothing was persisted, so do NOT let
						// the `done` handler refetch history over the top of this message.
						return;
					}

					if (parsed.type === "error" && parsed.message) {
						const message = parsed.message;
						setLiveMessages((prev) => {
							const last = prev[prev.length - 1];
							if (!last || last.role !== "assistant") return prev;
							return [...prev.slice(0, -1), { ...last, content: message }];
						});
						// Same reason as `retract`: the turn failed server-side and no
						// assistant row was persisted, so letting `done` refetch history
						// would replace this with silence — the student would see their
						// own question and no reply at all.
						return;
					}

					// The tutor asked a question. The frame carries the check as the
					// student may see it — the keyless projection — so the panel can be
					// filled from it directly rather than waiting for a refetch that
					// nothing triggers. Without this the student finishes a turn in
					// which they were asked something and sees no question until the
					// window happens to regain focus.
					if (parsed.type === "concept_check" && parsed.check) {
						utils.lessonAssistant.pendingCheck.setData(
							{ lessonId },
							parsed.check,
						);
					}

					if (parsed.type === "done") {
						void utils.lessonAssistant.getHistory.invalidate({ lessonId });
						setLiveMessages([]);
					}
				}
			}
		} catch (e) {
			if (isAbortError(e)) return;
			setLiveMessages((prev) => {
				const last = prev[prev.length - 1];
				if (!last || last.role !== "assistant") return prev;
				return [
					...prev.slice(0, -1),
					{
						...last,
						content: "Something went wrong. Please try again.",
						isStreaming: false,
					},
				];
			});
		} finally {
			setLiveMessages((prev) =>
				prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
			);
			setIsLoading(false);
		}
	};

	return {
		messages: allMessages,
		isLoading,
		sendMessage,
		clearHistory: () => clearHistoryMutation.mutate({ lessonId }),
		isClearingHistory: clearHistoryMutation.isPending,
	};
}
