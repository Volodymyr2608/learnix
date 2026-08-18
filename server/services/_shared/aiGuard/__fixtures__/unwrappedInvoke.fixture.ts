/**
 * Fixture: the literal-free `.invoke({ content })` shape. A template scan alone
 * never sees this — the untrusted value reaches the model through an object
 * property, with no template literal anywhere in the file.
 */
type Chain = { invoke: (vars: Record<string, unknown>) => Promise<string> };

export const summarise = async (
	chain: Chain,
	lesson: { content: string },
): Promise<string> => chain.invoke({ content: lesson.content });
