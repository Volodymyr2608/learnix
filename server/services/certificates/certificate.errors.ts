import { DomainError } from "@/server/services/base/base.errors";

export class CertificateNotFoundError extends DomainError {
	constructor() {
		super("Enrollment not found", "NOT_FOUND");
	}
}

export class CertificateNotCompleteError extends DomainError {
	constructor() {
		super("Course not yet completed", "CONFLICT");
	}
}