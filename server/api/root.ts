import { courseAIRouter } from "@/server/api/routers/ai";
import { courseRouter } from "@/server/api/routers/course";
import { instructorRouter } from "@/server/api/routers/instructor";
import { lessonRouter } from "@/server/api/routers/lesson";
import { quizRouter } from "@/server/api/routers/quiz";
import { userRouter } from "@/server/api/routers/user";
import { createCallerFactory, createTRPCRouter } from "./trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	user: userRouter,
	course: courseRouter,
	courseAI: courseAIRouter,
	instructor: instructorRouter,
	lesson: lessonRouter,
	quiz: quizRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
