import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import AIChatBuilderDialog from "@/app/_components/Course/components/AIChatBuilderDialog";
import { useCourseGenerationStatus } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useCourseGenerationStatus";
import { ChooseChatDialog } from "@/app/_components/Course/components/CreateCourseActions/components/ChooseChatDialog";
import type { CourseGenerationWithRelations } from "@/prisma/zod";
import { api } from "@/trpc/client";

type Mode = "new" | "continue" | null;

export const AIAssistantButton = () => {
	const [showChatBuilder, setShowChatBuilder] = useState(false);
	const [activeCourseGeneration, setActiveCourseGeneration] =
		useState<CourseGenerationWithRelations | null>(null);
	const [chooseChatDialogOpen, setChooseChatDialogOpen] = useState(false);

	const [mode, setMode] = useState<Mode>(null);

	const { refetch } = api.courseAI.getActiveCourseGeneration.useQuery(
		undefined,
		{
			enabled: false,
		},
	);

	const { setStatus } = useCourseGenerationStatus();

	const onClickHandler = async () => {
		const result = await refetch();
		const generation = result.data ?? null;

		setActiveCourseGeneration(generation);

		if (generation) {
			setChooseChatDialogOpen(true);
			return;
		}

		setMode("new");
		setShowChatBuilder(true);
	};

	const onContinueHandler = () => {
		setMode("continue");
		setChooseChatDialogOpen(false);
		setShowChatBuilder(true);
	};

	const onNewChatHandler = async () => {
		if (activeCourseGeneration) {
			await setStatus(activeCourseGeneration.id, "abandoned");
		}

		setMode("new");
		setChooseChatDialogOpen(false);
		setShowChatBuilder(true);
	};

	const handleChatOpenChange = (open: boolean) => {
		setShowChatBuilder(open);

		if (!open) {
			setMode(null);
			setActiveCourseGeneration(null);
		}
	};

	return (
		<>
			<Button
				className="bg-gradient-to-r from-primary to-primary/80"
				onClick={onClickHandler}
				type="button"
			>
				<Sparkles className="mr-2 h-4 w-4" />
				AI Assistant
			</Button>

			{showChatBuilder && (
				<AIChatBuilderDialog
					activeCourseGeneration={
						mode === "continue" ? activeCourseGeneration : null
					}
					onOpenChange={handleChatOpenChange}
					open={showChatBuilder}
				/>
			)}

			{chooseChatDialogOpen && (
				<ChooseChatDialog
					onContinueHandler={onContinueHandler}
					onNewChatHandler={onNewChatHandler}
					onOpenChange={setChooseChatDialogOpen}
					open={chooseChatDialogOpen}
				/>
			)}
		</>
	);
};
