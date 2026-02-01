import { FileText, Layers, ListChecks, Target } from "lucide-react";

export const STEPS = [
	{ id: "basic", label: "Basic Info", icon: FileText },
	{ id: "objectives", label: "Objectives", icon: Target },
	{ id: "requirements", label: "Requirements", icon: ListChecks },
	{ id: "curriculum", label: "Curriculum", icon: Layers },
] as const;

export type DraftStepType = (typeof STEPS)[number]["id"];
type NextDraftStep = Exclude<DraftStepType, "basic">;

export const STEPS_MAP: Record<DraftStepType, { next: NextDraftStep | null }> =
	{
		basic: { next: "objectives" },
		objectives: { next: "requirements" },
		requirements: { next: "curriculum" },
		curriculum: { next: null },
	};
