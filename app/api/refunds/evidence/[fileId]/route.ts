import { Role } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";
import { refundAppealRepository } from "@/server/repositories/refundAppeal.repository";
import { refundEvidenceStorage } from "@/server/services/refund/refundEvidenceStorage";

export const runtime = "nodejs";

const notFound = () => new Response(null, { status: 404 });

/** The stored name is metadata only; the header carries a sanitised copy. */
const safeName = (name: string) =>
	name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);

/**
 * C20 / C21 (V7): an evidence file, as a download, only to the payment's student or an admin. Anyone
 * else — another student, the instructor, an anonymous caller — gets the same 404 as a missing file.
 */
export const GET = async (
	_req: Request,
	{ params }: { params: Promise<{ fileId: string }> },
) => {
	const session = await getSession();
	if (!session?.user) return notFound();
	const { fileId } = await params;

	const file = await refundAppealRepository.findFileForViewer(fileId, {
		id: session.user.id,
		isAdmin: session.user.role === Role.ADMIN,
	});
	if (!file) return notFound();

	const stream = await refundEvidenceStorage.get(file.blobPathname);
	if (!stream) return notFound();

	return new Response(stream, {
		headers: {
			"Content-Type": file.contentType,
			"Content-Disposition": `attachment; filename="${safeName(file.fileName)}"`,
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
			"Cache-Control": "private, no-store",
		},
	});
};
