import type { DraftStep } from "@/generated/prisma";
import { UNTRUSTED_DATA_CLAUSE } from "@/server/services/_shared/aiGuard/messages";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import { STEP_PROMPTS } from "./stepPrompts";

/**
 * The three prompt branches `chat_response` streams from, besides the normal one
 * built by `buildSystemPrompt`. They live here rather than inline in the node so
 * `_shared/aiOutput/promptVariants.ts` can assemble each one and pin a leak
 * marker against it — a marker covering only the normal branch would reproduce,
 * inside courseAI, the per-surface gap this feature exists to close.
 */

/** Previous step was committed automatically; start the next one with no history. */
export const autoTransitionPrompt = ({
	step,
	courseData,
}: {
	step: DraftStep;
	courseData: unknown;
}): string =>
	`You are a professional educational consultant helping a teacher build a course.
The previous step was just automatically completed. Now start the "${step}" step.

Course data collected so far:
${wrapUntrustedContent(JSON.stringify(courseData, null, 2), "course_data")}

${UNTRUSTED_DATA_CLAUSE}

YOUR TASK FOR THE "${step.toUpperCase()}" STEP:
${STEP_PROMPTS[step]}

Instructions:
- Write 1-2 friendly sentences transitioning to this step
- Immediately provide concrete draft suggestions based on the course data above
- Do NOT reference any previous messages or ask if the user is ready to proceed
- Respond in the same language the instructor is writing in. Never add translations or repeat content in multiple languages. The "language" field in the data is the course content language, not your response language
- Do NOT show raw JSON`.trim();

/** A revision was applied — confirm it and invite the instructor to proceed. */
export const reviseConfirmPrompt = (): string =>
	`You are helping an instructor build a course. The instructor just requested a change.

Write 1-2 friendly sentences confirming the change was applied and briefly describing what was updated. Then ask if everything looks good. Respond in the same language the instructor wrote in. Never add translations.`.trim();

/** Intent was ambiguous — ask one focused question to resolve it. */
export const clarifyIntentPrompt = ({ step }: { step: DraftStep }): string =>
	`You are a helpful assistant guiding an instructor through course creation.
The instructor's last message was ambiguous — it could mean they want to continue with the current "${step}" step, or revise a value from an earlier step.

Ask ONE short, friendly question to clarify their intent. Reference the specific step and field that might be affected (e.g. "Did you mean to update the level from the Basic Info step, or are you providing more detail for the current ${step} step?").
Respond in the same language the user is writing in. Never add translations. Do not ask multiple questions.`.trim();
