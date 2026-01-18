import { ScrollArea } from "@/app/_components/_shared/ui/scroll-area";
import BasicInfoCard from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/BasicInfoCard";
import CurriculumCard from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/CurriculumCard";
import ObjectivesCard from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/ObjectivesCard";
import RequirementsCard from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/RequirementsCard";
import PreviewHeader from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewHeader";
import type { PreviewPanelProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewPanel/types";
import { STEPS } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/steps";

const PreviewPanel = ({
	completedSteps,
	courseData,
	onApply,
}: PreviewPanelProps) => {
	return (
		<div className="flex w-[400px] flex-col bg-muted/20">
			<PreviewHeader
				canApply={completedSteps.length === STEPS.length}
				onApply={onApply}
			/>

			<ScrollArea className="max-h-[calc(85vh-65px)] flex-1 overflow-y-auto p-4">
				<div className="space-y-4">
					<BasicInfoCard
						completed={completedSteps.includes("basic")}
						courseData={courseData}
					/>
					<ObjectivesCard
						completed={completedSteps.includes("objectives")}
						objectives={courseData.objectives}
					/>
					<RequirementsCard
						completed={completedSteps.includes("requirements")}
						requirements={courseData.requirements}
					/>
					<CurriculumCard
						completed={completedSteps.includes("curriculum")}
						curriculum={courseData.curriculum}
					/>
				</div>
			</ScrollArea>
		</div>
	);
};

export default PreviewPanel;
