import { render } from "@react-email/render";
import { createElement } from "react";
import { emailTemplates, type TemplateKey } from "./email.templates";

export async function renderTemplate(key: TemplateKey, payload: unknown) {
	const entry = emailTemplates[key];
	const parsed = entry.payload.parse(payload);
	const element = createElement(
		entry.component as React.ComponentType<unknown>,
		parsed as Record<string, unknown>,
	);
	const [html, text] = await Promise.all([
		render(element),
		render(element, { plainText: true }),
	]);
	return { html, text, subject: entry.subject(parsed) };
}
