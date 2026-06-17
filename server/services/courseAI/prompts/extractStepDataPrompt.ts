import { DraftStep } from "@/generated/prisma";

const structures = {
	[DraftStep.basic]: `{ "title": "string", "subtitle": "string", "description": "string", "category": "string", "level": "Beginner | Intermediate | Advanced", "language": "string", "duration": "string" }`,
	[DraftStep.objectives]: `{ "objectives": [{ "value": "string" }] }`,
	[DraftStep.requirements]: `{ "requirements": [{ "value": "string" }] }`,
	[DraftStep.curriculum]: `{ "sections": [{ "title": "string", "order": number, "lessons": [{ "title": "string", "durationMinutes": number }] }] }`,
};

type ExtractStepDataPromptProps = {
	step: DraftStep;
	history: string;
	courseData?: Record<string, unknown>;
};

export const extractStepDataPrompt = ({
	step,
	history,
	courseData,
}: ExtractStepDataPromptProps) => {
	return `
    You are a data extraction tool. Your task is to extract course information for the current step.
    CURRENT STEP: ${step}

    COURSE DATA COLLECTED SO FAR (authoritative — use for context and consistency):
    ${JSON.stringify(courseData ?? {}, null, 2)}

    EXPECTED JSON STRUCTURE for this step:
    ${structures[step]}

    RULES:
    1. Return ONLY a JSON object matching the structure above. No extra fields, no explanations.
    2. Use the CHAT HISTORY for the current step as the primary source. If multiple versions appear, extract from the MOST COMPLETE AND DETAILED version, ignoring short acknowledgements like "Great, finalizing this step!".
    3. If fields are missing from the chat history, infer them from the COURSE DATA ABOVE and the course topic.
    4. The language of ALL generated content must match the language of the conversation.
    5. CONTENT CONSTRAINTS:
        - "description" MUST be no longer than 500 characters.
        - "objectives" MUST contain AT LEAST 4 items starting with an action verb.
        - "requirements" MUST be realistic prerequisites for students — skills or tools they need BEFORE taking the course. Do NOT include course metadata like duration or level. Provide AT LEAST 2 items; infer additional ones from the course topic if fewer were discussed.

    6. CURRICULUM STRUCTURE RULES:
        - "sections" MUST contain AT LEAST 1 section
        - Each section MUST have:
          - a non-empty "title" (3–120 characters),
          - AT LEAST 1 lesson
        - Each lesson MUST have:
          - a non-empty "title" (3–120 characters),
          - an OPTIONAL "durationMinutes" as a whole number of minutes (e.g. 15, 90).
        - Lesson titles and section titles MUST be concise and descriptive.
        - Avoid duplicate section titles and duplicate lesson titles within the same section.

    CHAT HISTORY (current step only):
    ${history}
  `;
};
