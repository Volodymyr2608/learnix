import { Resend } from "resend";
import { env } from "@/lib/env";
import { userRepository } from "@/server/repositories/user.repository";
import { logger } from "@/server/utils/logger";
import {
	InvalidPayloadError,
	ResendSendError,
	UnknownTemplateError,
} from "./email.errors";
import { renderTemplate } from "./email.renderer";
import { emailTemplates, type TemplateKey } from "./email.templates";

type SendInput = {
	templateKey: string;
	toEmail: string;
	userId?: string;
	payload: unknown;
};

class EmailService {
	private _resend: Resend | undefined;

	private get resend(): Resend {
		if (!this._resend) this._resend = new Resend(env.RESEND_API_KEY);
		return this._resend;
	}

	async send(
		input: SendInput,
	): Promise<{ id: string } | { skipped: "opted_out" }> {
		const entry = emailTemplates[input.templateKey as TemplateKey];
		if (!entry) throw new UnknownTemplateError(input.templateKey);

		if (entry.criticality !== "CRITICAL" && input.userId) {
			const user = await userRepository.findFirst({
				where: { id: input.userId },
				select: { emailNotificationsEnabled: true },
			});
			if (user && !user.emailNotificationsEnabled) {
				return { skipped: "opted_out" };
			}
		}

		const parsed = entry.payload.safeParse(input.payload);
		if (!parsed.success) throw new InvalidPayloadError(parsed.error.issues);

		const { html, text, subject } = await renderTemplate(
			input.templateKey as TemplateKey,
			parsed.data,
		);

		const { data, error } = await this.resend.emails.send({
			from: env.EMAIL_FROM_ADDRESS,
			...(env.EMAIL_REPLY_TO && { replyTo: env.EMAIL_REPLY_TO }),
			to: input.toEmail,
			subject,
			html,
			text,
		});

		if (error) {
			logger.error("resend_failed", {
				templateKey: input.templateKey,
				toEmail: input.toEmail,
				error,
			});
			throw new ResendSendError(error.message);
		}

		return { id: data.id };
	}
}

export const emailService = new EmailService();
