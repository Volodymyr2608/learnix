/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { Role } from "@/generated/prisma";
import { reportError } from "@/server/observability/reportError";
import { shouldReport } from "@/server/observability/shouldReport";
import { logger } from "@/server/utils/logger";
import { auth } from "../better-auth";
import { db } from "../db";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
	const session = await auth.api.getSession({
		headers: opts.headers,
	});
	return {
		db,
		session,
		...opts,
	};
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError:
					error.cause instanceof ZodError ? error.cause.flatten() : null,
			},
		};
	},
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * The middleware factory only. `t` stays unexported: handing every file
 * `t.procedure` / `t.router` would widen the surface this narrows. A real but
 * near-zero-value narrowing — publicProcedure is exported anyway, so anyone
 * wanting an unauthenticated procedure already has one. Keep it for blast
 * radius and one import site; it is not a control.
 */
export const createTRPCMiddleware = t.middleware;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
	const start = Date.now();

	if (t._config.isDev) {
		// artificial delay in dev
		const waitMs = Math.floor(Math.random() * 400) + 100;
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}

	/**
	 * The single capture point for the whole API (spec.md AC 1).
	 *
	 * tRPC is reached by two paths that share no handler: client components go
	 * through fetchRequestHandler (app/api/trpc/[trpc]/route.ts, which has onError),
	 * and server components go through createCaller (trpc/server.ts:25), which never
	 * touches that route. This middleware is chained onto publicProcedure and
	 * protectedProcedure, and every role procedure builds on those — so it is the one
	 * place that sees both.
	 *
	 * The try/catch also closes a gap that predates Sentry: without it a throwing
	 * procedure skipped its own timing line entirely (AC 40).
	 */
	try {
		const result = await next();
		logger.info(`[TRPC] ${path} took ${Date.now() - start}ms to execute`);
		return result;
	} catch (error) {
		logger.info(
			`[TRPC] ${path} took ${Date.now() - start}ms to execute (failed)`,
		);
		if (shouldReport(error)) {
			reportError(error, "trpc_procedure_failed", { path });
		}
		throw error;
	}
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
	.use(timingMiddleware)
	.use(({ ctx, next }) => {
		if (!ctx.session?.user) {
			throw new TRPCError({ code: "UNAUTHORIZED" });
		}
		return next({
			ctx: {
				// infers the `session` as non-nullable
				session: { ...ctx.session, user: ctx.session.user },
			},
		});
	});

/**
 * Role-based protected procedure
 *
 * This procedure restricts access based on the user's role.
 * It should be used as a base for creating role-specific procedures.
 *
 * @param role - Required user role to access the procedure
 *
 * @example
 * const adminProcedure = roleProcedure(Role.ADMIN);
 */
const roleProcedure = (role: Role) =>
	protectedProcedure.use(({ ctx, next }) => {
		if (ctx.session.user.role !== role) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message:
					"Access denied. You don’t have the required permissions to perform this action.",
			});
		}

		return next({ ctx });
	});

/**
 * Instructor procedure
 *
 * This procedure is only accessible to users with the "INSTRUCTOR" role.
 * It is built on top of `roleProcedure` and requires the user to be authenticated.
 *
 * @example
 * instructorProcedure.query(() => { ... });
 */
export const instructorProcedure = roleProcedure(Role.INSTRUCTOR);

/**
 * Student procedure
 *
 * This procedure is only accessible to users with the "STUDENT" role.
 * It is built on top of `protectedProcedure`, so authentication is required.
 *
 * @example
 * studentProcedure.query(() => { ... });
 */
export const studentProcedure = roleProcedure(Role.STUDENT);

/**
 * Admin procedure
 *
 * This procedure is only accessible to users with the "ADMIN" role.
 * It is built on top of `protectedProcedure`, so authentication is required.
 *
 * @example
 * adminProcedure.mutation(() => { ... });
 */
export const adminProcedure = roleProcedure(Role.ADMIN);
