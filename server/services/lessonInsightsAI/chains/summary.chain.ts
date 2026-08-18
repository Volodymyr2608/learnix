import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { UNTRUSTED_DATA_CLAUSE } from "@/server/services/_shared/aiGuard/messages";
import {
	MODEL_MAX_RETRIES,
	MODEL_TIMEOUT_MS,
} from "@/server/services/_shared/aiLimits/modelDefaults";
import { SummarySchema } from "../schemas/lessonInsights.schema";

export const SUMMARY_SYSTEM_PROMPT = `You are a study-guide editor. Given the full text of a lesson, write a single concise paragraph (60–150 words) that captures the lesson's purpose, main argument or technique, and the practical takeaway. No bullet points, no headers.\n\n${UNTRUSTED_DATA_CLAUSE}`;

const prompt = ChatPromptTemplate.fromMessages([
	["system", SUMMARY_SYSTEM_PROMPT],
	["human", "{content}"],
]);

const llm = new ChatOpenAI({
	model: "gpt-4o-mini",
	temperature: 0,
	timeout: MODEL_TIMEOUT_MS,
	maxRetries: MODEL_MAX_RETRIES,
}).withStructuredOutput(SummarySchema);

export const summaryChain = prompt.pipe(llm);
