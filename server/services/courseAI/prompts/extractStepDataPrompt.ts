import { DraftStep } from "@/generated/prisma";

const structures = {
	[DraftStep.basic]: `{ "title": "string", "subtitle": "string", "description": "string", "category": "string", "level": "Beginner | Intermediate | Advanced", "language": "string", "duration": "string" }`,
	[DraftStep.objectives]: `{ "objectives": [{ "value": "string" }] }`,
	[DraftStep.requirements]: `{ "requirements": [{ "value": "string" }] }`,
	[DraftStep.curriculum]: `{ "sections": [{ "title": "string", "order": number, "lessons": [{ "title": "string", "duration": "string" }] }] }`,
};

type ExtractStepDataPromptProps = {
	step: DraftStep;
	history: string;
};

export const extractStepDataPrompt = ({
	step,
	history,
}: ExtractStepDataPromptProps) => {
	return `
    You are a data extraction tool. Your task is to extract course information from the chat history.
    CURRENT STEP: ${step}
    
    EXPECTED JSON STRUCTURE for this step:
    ${structures[step]}

    RULES:
    1. Return ONLY a JSON object. No explanations, no extra text.
    2. Use the data discussed in the chat history as the primary source.
    3. If some fields are missing in the chat history, infer them realistically based on the course topic.
    4. The language of ALL generated content must match the language of the conversation.
    5. CONTENT CONSTRAINTS:
        - "description" MUST be no longer than 500 characters.
        - "objectives" MUST contain AT LEAST 4 items. Each objective must be clear, specific, and concise.
        - "requirements" MUST include ALL items mentioned in the chat history. If there are fewer than 2, infer additional realistic requirements based on the course topic.

    6. CURRICULUM STRUCTURE RULES:
        - "sections" MUST contain AT LEAST 1 section
        - Each section MUST have:
          - a non-empty "title" (3–120 characters),
          - AT LEAST 1 lesson
        - Each lesson MUST have:
          - a non-empty "title" (3–120 characters),
          - an OPTIONAL "duration" in one of the following formats only:
            "10 min", "45 minutes", "1 h", or "2 hours".
        - Lesson titles and section titles MUST be concise and descriptive.
        - Avoid duplicate section titles and duplicate lesson titles within the same section.

    CHAT HISTORY:
    ${history}
  `;
};
