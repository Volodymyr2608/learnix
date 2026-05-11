import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({
	chunkSize: 1000,
	chunkOverlap: 100,
});

export async function chunkLessonContent(
	content: string,
): Promise<Array<{ content: string; index: number }>> {
	if (!content.trim()) return [];
	const docs = await splitter.createDocuments([content]);
	return docs.map((doc, index) => ({ content: doc.pageContent, index }));
}
