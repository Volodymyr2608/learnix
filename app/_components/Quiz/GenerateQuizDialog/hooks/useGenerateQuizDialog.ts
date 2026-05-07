import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/trpc/client";
import type {
	DialogState,
	EditableQuestion,
	GenerateQuizDialogProps,
} from "../types";

export function useGenerateQuizDialog({
	lessonId,
	open,
	onOpenChange,
}: GenerateQuizDialogProps) {
	const [state, setState] = useState<DialogState>({ phase: "generating" });

	const generateMutation = api.quiz.generateAI.useMutation({
		onSuccess: (questions) => {
			setState({
				phase: "review",
				questions: questions.map((q) => ({
					id: crypto.randomUUID(),
					question: q.question,
					options: q.options as [string, string, string, string],
					correctIndex: Math.max(0, q.options.indexOf(q.correct)),
				})),
			});
		},
		onError: (error) => {
			if (error.data?.code === "BAD_REQUEST") {
				toast.error("Lesson has no content to generate quiz from");
			} else {
				toast.error("Generation failed, try again");
			}
			onOpenChange(false);
		},
	});

	const upsertMutation = api.quiz.upsertMany.useMutation({
		onSuccess: () => {
			onOpenChange(false);
		},
		onError: () => {
			toast.error("Failed to save quiz, try again");
			setState((prev) =>
				prev.phase === "saving"
					? { phase: "review", questions: prev.questions }
					: prev,
			);
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: fires only on open transition; mutate and lessonId are stable
	useEffect(() => {
		if (!open) return;
		setState({ phase: "generating" });
		generateMutation.mutate({ lessonId, count: 3 });
	}, [open]);

	function handleRegenerate() {
		setState({ phase: "generating" });
		generateMutation.mutate({ lessonId, count: 3 });
	}

	function handleSave() {
		if (state.phase !== "review") return;
		const { questions } = state;
		setState({ phase: "saving", questions });
		upsertMutation.mutate({
			lessonId,
			questions: questions.map((q) => ({
				question: q.question,
				options: [...q.options],
				correct: q.options[q.correctIndex] ?? q.options[0] ?? "",
			})),
		});
	}

	function updateQuestion(id: string, patch: Partial<EditableQuestion>) {
		setState((prev) => {
			if (prev.phase !== "review") return prev;
			return {
				phase: "review",
				questions: prev.questions.map((q) =>
					q.id === id ? { ...q, ...patch } : q,
				),
			};
		});
	}

	function updateOption(id: string, optIndex: number, value: string) {
		setState((prev) => {
			if (prev.phase !== "review") return prev;
			return {
				phase: "review",
				questions: prev.questions.map((q) => {
					if (q.id !== id) return q;
					const opts = [...q.options] as [string, string, string, string];
					opts[optIndex] = value;
					return { ...q, options: opts };
				}),
			};
		});
	}

	const questions =
		state.phase === "review" || state.phase === "saving"
			? state.questions
			: null;

	const isSaving = state.phase === "saving";

	return {
		questions,
		isSaving,
		handleRegenerate,
		handleSave,
		updateQuestion,
		updateOption,
	};
}
