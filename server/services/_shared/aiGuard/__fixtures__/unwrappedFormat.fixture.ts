/**
 * Fixture: quizAI's `.format({ … })` shape, written with a shorthand property.
 * Shorthand is the idiom a developer reaches for first, so default-deny has to
 * see through it as well as through `{ level: level }`.
 */
type Template = { format: (vars: Record<string, unknown>) => Promise<string> };

export const buildQuizPrompt = async (
	template: Template,
	level: string,
	count: number,
): Promise<string> => template.format({ level, count });
