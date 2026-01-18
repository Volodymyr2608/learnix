import { Check, ChevronRight } from "lucide-react";
import type { ProgressStepsProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatHeader/components/ProgressSteps/types";
import { STEPS } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/steps";

const ProgressSteps = ({ completedSteps, currentStep }: ProgressStepsProps) => {
	return (
		<div className="mt-4 flex items-center gap-2">
			{STEPS.map((step, index) => {
				const Icon = step.icon;
				const isCompleted = completedSteps.includes(step.id);
				const isCurrent = index === currentStep;

				return (
					<div className="flex items-center" key={step.id}>
						<div
							className={`flex items-center gap-1.5 rounded-full px-2 py-1 font-medium text-xs transition-colors ${
								isCompleted
									? "bg-green-500/10 text-green-600"
									: isCurrent
										? "bg-primary/10 text-primary"
										: "bg-muted text-muted-foreground"
							}`}
						>
							{isCompleted ? (
								<Check className="h-3 w-3" />
							) : (
								<Icon className="h-3 w-3" />
							)}
							<span className="hidden sm:inline">{step.label}</span>
						</div>
						{index < STEPS.length - 1 && (
							<ChevronRight className="mx-1 h-4 w-4 text-muted-foreground" />
						)}
					</div>
				);
			})}
		</div>
	);
};

export default ProgressSteps;
