import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { UNTRUSTED_DATA_CLAUSE } from "@/server/services/_shared/aiGuard/messages";
import { SummarySchema } from "../schemas/lessonInsights.schema";

const prompt = ChatPromptTemplate.fromMessages([
	[
		"system",
		`You are a study-guide editor. Given the full text of a lesson, write a single concise paragraph (60–150 words) that captures the lesson's purpose, main argument or technique, and the practical takeaway. No bullet points, no headers.\n\n${UNTRUSTED_DATA_CLAUSE}`,
	],
	["human", "{content}"],
]);

const llm = new ChatOpenAI({
	model: "gpt-4o-mini",
	temperature: 0,
}).withStructuredOutput(SummarySchema);

export const summaryChain = prompt.pipe(llm);
