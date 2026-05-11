import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { GlossarySchema } from "../schemas/lessonInsights.schema";

const prompt = ChatPromptTemplate.fromMessages([
	[
		"system",
		"You are a study-guide editor. Given the full text of a lesson, extract domain-specific terms and jargon that a beginner might not know. For each term, provide its name and a plain-language definition (10–300 characters). Return an empty list if the lesson contains no special terminology.",
	],
	["human", "{content}"],
]);

const llm = new ChatOpenAI({
	model: "gpt-4o-mini",
	temperature: 0,
}).withStructuredOutput(GlossarySchema);

export const glossaryChain = prompt.pipe(llm);
