import { DomainError } from "@/server/services/base/base.errors";

export class InvoiceNotFoundError extends DomainError {
	constructor() {
		super("Payment not found", "NOT_FOUND");
	}
}
