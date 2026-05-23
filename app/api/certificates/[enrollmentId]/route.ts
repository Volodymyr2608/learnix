import {
	CertificateNotCompleteError,
	CertificateNotFoundError,
} from "@/server/services/certificates/certificate.errors";
import { certificateService } from "@/server/services/certificates/certificate.service";
import { verifyCertificateToken } from "@/server/services/notifications/auth";

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ enrollmentId: string }> },
) {
	const { enrollmentId } = await params;
	const token = new URL(req.url).searchParams.get("token");

	if (!token) {
		return new Response("Unauthorized", { status: 401 });
	}

	try {
		const claims = await verifyCertificateToken(token);
		if (claims.enrollmentId !== enrollmentId) {
			return new Response("Unauthorized", { status: 401 });
		}
	} catch {
		return new Response("Unauthorized", { status: 401 });
	}

	try {
		const buf = await certificateService.renderPdf(enrollmentId);
		return new Response(new Uint8Array(buf), {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="${enrollmentId}-certificate.pdf"`,
			},
		});
	} catch (e) {
		if (e instanceof CertificateNotFoundError) {
			return new Response("Not found", { status: 404 });
		}
		if (e instanceof CertificateNotCompleteError) {
			return new Response("Course not completed", { status: 409 });
		}
		throw e;
	}
}
