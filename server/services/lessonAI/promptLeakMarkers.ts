import { leakMarkersFor } from "@/server/services/_shared/aiOutput/promptLeakMarkers";

/**
 * The tutor's slice of the shared registry, kept as a named export because
 * `lessonAI.agent.test.ts` pins every entry against the assembled tutor prompt
 * and `_shared/aiOutput` must not import from lessonAI (AC 7). The markers
 * themselves now live in one place for all five surfaces.
 */
export const SYSTEM_PROMPT_LEAK_MARKERS: readonly string[] =
	leakMarkersFor("lessonAI");
