import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { ConceptsSchema } from "../schemas/lessonInsights.schema";

const prompt = ChatPromptTemplate.fromMessages([
	[
		"system",
		"You are a study-guide editor. Given the full text of a lesson, identify the 3–7 most important concepts the student must understand. For each concept, provide a short name (1–5 words) and a one-sentence explanation (10–300 characters). Return only concepts explicitly covered in the lesson.",
	],
	["human", "{content}"],
]);

const llm = new ChatOpenAI({
	model: "gpt-4o-mini",
	temperature: 0,
}).withStructuredOutput(ConceptsSchema);

export const conceptsChain = prompt.pipe(llm);
