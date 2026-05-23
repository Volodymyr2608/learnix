import { useEffect } from "react";
import { ScrollArea } from "@/app/_components/_shared/ui/scroll-area";
import BasicInfoCard from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/BasicInfoCard";
import CurriculumCard from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/CurriculumCard";
import ObjectivesCard from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/ObjectivesCard";
import RequirementsCard from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/RequirementsCard";
import PreviewHeader from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewHeader";
import type { PreviewPanelProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewPanel/types";
import { STEPS } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/steps";
import type { CourseSchemaOutput } from "@/server/entities/course";
import { api } from "@/trpc/client";

const PreviewPanel = ({
	courseGenerationId,
	completedSteps,
	onApply,
	isApplyPending,
	revisionCount,
}: PreviewPanelProps) => {
	const { data, refetch } = api.courseAI.getGenerationStatus.useQuery(
		{
			courseGenerationId: courseGenerationId ?? "",
		},
		{
			enabled: !!courseGenerationId,
		},
	);

	useEffect(() => {
		if (courseGenerationId && completedSteps.length > 0) {
			void refetch();
		}
	}, [completedSteps.length, courseGenerationId, refetch]);

	useEffect(() => {
		if (courseGenerationId && revisionCount) {
			void refetch();
		}
	}, [revisionCount, courseGenerationId, refetch]);

	const sectionsData = (
		!!data && "sectionsData" in data ? data.sectionsData : {}
	) as CourseSchemaOutput;

	return (
		<div className="flex w-[400px] flex-col bg-muted/20">
			<PreviewHeader
				canApply={completedSteps.length === STEPS.length}
				isApplyPending={isApplyPending}
				onApply={() => onApply(sectionsData)}
			/>

			<ScrollArea className="max-h-[calc(85vh-65px)] flex-1 overflow-y-auto p-4">
				<div className="space-y-4">
					<BasicInfoCard
						completed={completedSteps.includes("basic")}
						courseData={sectionsData}
					/>
					<ObjectivesCard
						completed={completedSteps.includes("objectives")}
						objectives={sectionsData.objectives ?? []}
					/>
					<RequirementsCard
						completed={completedSteps.includes("requirements")}
						requirements={sectionsData.requirements ?? []}
					/>
					<CurriculumCard
						completed={completedSteps.includes("curriculum")}
						curriculum={sectionsData.sections ?? []}
					/>
				</div>
			</ScrollArea>
		</div>
	);
};

export default PreviewPanel;
