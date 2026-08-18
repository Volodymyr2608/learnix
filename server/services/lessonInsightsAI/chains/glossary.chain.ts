import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { UNTRUSTED_DATA_CLAUSE } from "@/server/services/_shared/aiGuard/messages";
import {
	MODEL_MAX_RETRIES,
	MODEL_TIMEOUT_MS,
} from "@/server/services/_shared/aiLimits/modelDefaults";
import { GlossarySchema } from "../schemas/lessonInsights.schema";

export const GLOSSARY_SYSTEM_PROMPT = `You are a study-guide editor. Given the full text of a lesson, extract domain-specific terms and jargon that a beginner might not know. For each term, provide its name and a plain-language definition (10–300 characters). Return an empty list if the lesson contains no special terminology.\n\n${UNTRUSTED_DATA_CLAUSE}`;

const prompt = ChatPromptTemplate.fromMessages([
	["system", GLOSSARY_SYSTEM_PROMPT],
	["human", "{content}"],
]);

const llm = new ChatOpenAI({
	model: "gpt-4o-mini",
	temperature: 0,
	timeout: MODEL_TIMEOUT_MS,
	maxRetries: MODEL_MAX_RETRIES,
}).withStructuredOutput(GlossarySchema);

export const glossaryChain = prompt.pipe(llm);
