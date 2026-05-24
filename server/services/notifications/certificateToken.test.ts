import { describe, expect, it } from "vitest";
import { signCertificateToken, verifyCertificateToken } from "./auth";

describe("certificate token", () => {
	it("round-trips an enrollmentId", async () => {
		const token = await signCertificateToken("enr-123");
		const payload = await verifyCertificateToken(token);
		expect(payload.enrollmentId).toBe("enr-123");
	});

	it("rejects a tampered token", async () => {
		const token = await signCertificateToken("enr-123");
		const tampered = `${token.slice(0, -2)}xy`;
		await expect(verifyCertificateToken(tampered)).rejects.toThrow();
	});
});
