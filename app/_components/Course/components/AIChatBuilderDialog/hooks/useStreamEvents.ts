import { useCallback, useRef, useState } from "react";
import { STEPS } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/steps";
import type { StreamEvent } from "@/app/_components/Course/components/AIChatBuilderDialog/guards/isStreamEvent";
import type { DraftStep } from "@/generated/prisma";

export const useStreamEvents = () => {
	const [currentStep, setCurrentStep] = useState(0);
	const [completedSteps, setCompletedSteps] = useState<DraftStep[]>([]);
	const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
	const [revisionCount, setRevisionCount] = useState(0);
	const [lastConfidence, setLastConfidence] = useState<number | null>(null);
	const [lastAutoAdvanced, setLastAutoAdvanced] = useState(false);
	const [showAcceptButton, setShowAcceptButton] = useState(false);

	const stepCommittedRef = useRef(false);
	const autoAdvancedRef = useRef(false);
	const confidenceFiredRef = useRef(false);
	// Set each render to the latest triggerNextStep — avoids circular hook dependency.
	const triggerNextStepRef = useRef<(() => void) | null>(null);

	const onStreamEvent = useCallback((ev: StreamEvent) => {
		switch (ev.type) {
			case "tool_call":
				setActiveToolCall(ev.name);
				break;
			case "node_start":
				setActiveToolCall(ev.node);
				break;
			case "content_revised":
				setRevisionCount((n) => n + 1);
				break;
			case "token":
				setActiveToolCall(null);
				break;
			case "confidence":
				setLastConfidence(ev.value);
				confidenceFiredRef.current = true;
				break;
			case "step_committed": {
				stepCommittedRef.current = true;
				setLastAutoAdvanced(ev.autoAdvanced);
				const idx = STEPS.findIndex((s) => s.id === ev.step);
				if (idx >= 0) {
					setCurrentStep(idx + 1);
					setCompletedSteps((prev) =>
						prev.includes(ev.step) ? prev : [...prev, ev.step],
					);
				}
				setShowAcceptButton(false);
				autoAdvancedRef.current = true;
				break;
			}
			case "done":
				setActiveToolCall(null);
				if (!stepCommittedRef.current && confidenceFiredRef.current) {
					setShowAcceptButton(true);
				}
				stepCommittedRef.current = false;
				confidenceFiredRef.current = false;
				if (autoAdvancedRef.current) {
					autoAdvancedRef.current = false;
					setTimeout(() => triggerNextStepRef.current?.(), 1800);
				}
				break;
		}
	}, []);

	const resetBeforeStream = useCallback(() => {
		setShowAcceptButton(false);
		setLastAutoAdvanced(false);
		setLastConfidence(null);
		stepCommittedRef.current = false;
		confidenceFiredRef.current = false;
	}, []);

	const resetAll = useCallback(() => {
		setCurrentStep(0);
		setCompletedSteps([]);
		setActiveToolCall(null);
		setLastConfidence(null);
		setLastAutoAdvanced(false);
		setShowAcceptButton(false);
		setRevisionCount(0);
		stepCommittedRef.current = false;
	}, []);

	return {
		currentStep,
		setCurrentStep,
		completedSteps,
		setCompletedSteps,
		activeToolCall,
		lastConfidence,
		lastAutoAdvanced,
		showAcceptButton,
		revisionCount,
		onStreamEvent,
		triggerNextStepRef,
		resetBeforeStream,
		resetAll,
	};
};