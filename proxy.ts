import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { Role } from "@/generated/prisma";
import { auth } from "@/server/better-auth";

export async function proxy(request: NextRequest) {
	const session = await auth.api.getSession({ headers: request.headers });
	const sessionCookie = getSessionCookie(request);

	if (!sessionCookie) {
		return NextResponse.redirect(new URL("/sign-in", request.url));
	}

	const pathname = request.nextUrl.pathname;

	if (pathname.startsWith("/instructor")) {
		if (!session?.user || session.user.role !== Role.INSTRUCTOR) {
			return NextResponse.redirect(new URL("/dashboard", request.url));
		}
	}

	if (pathname.startsWith("/dashboard")) {
		if (!session?.user || session.user.role !== Role.STUDENT) {
			return NextResponse.redirect(new URL("/instructor", request.url));
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/instructor/:path*", "/dashboard/:path*"],
};
