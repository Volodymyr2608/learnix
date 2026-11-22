import { Role } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";
import { DomainError } from "@/server/services/base/base.errors";
import { refundAppealAdminService } from "@/server/services/refund/refundAppealAdmin.service";
import {
	chosenFiles,
	formField,
	isOverBodyLimit,
	refundErrorStatus,
} from "@/server/services/refund/refundHttp";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";

/**
 * FR-A2 (V13, C17): an admin denies an appeal with a written reason and 0–3 files. Anyone who is
 * not an admin gets the same 404 as a missing appeal.
 */
export const POST = async (
	req: Request,
	{ params }: { params: Promise<{ id: string }> },
) => {
	const session = await getSession();
	if (session?.user?.role !== Role.ADMIN)
		return new Response(null, { status: 404 });
	if (isOverBodyLimit(req))
		return Response.json(
			{ error: "The files are too large." },
			{ status: 413 },
		);
	const { id } = await params;

	try {
		const form = await req.formData();
		await refundAppealAdminService.denyAppeal(session.user.id, id, {
			reason: formField(form, "reason"),
			files: chosenFiles(form),
		});
		return new Response(null, { status: 204 });
	} catch (error) {
		if (error instanceof DomainError)
			return Response.json(
				{ error: error.message },
				{ status: refundErrorStatus(error) },
			);
		logger.error("Appeal denial failed", { error });
		return Response.json({ error: "Something went wrong." }, { status: 500 });
	}
};
