import type { UrlPolicy } from "./types";
import { authoredContentUrlPolicy, modelOutputUrlPolicy } from "./urlPolicy";

/**
 * Every markdown renderer in the app and the policy it runs. Declared here so
 * `renderers.contract.test.ts` can assert set-equality in BOTH directions: a
 * renderer missing from this map fails, and an entry here with no matching file
 * fails too. A registry that only checks the first direction is registration
 * coverage pretending to be real coverage.
 */
export const RENDERER_POLICY: Record<string, UrlPolicy> = {
	// Instructor-authored lesson bodies.
	"app/_components/Course/components/CourseLearnView/components/MarkdownContent/index.tsx":
		authoredContentUrlPolicy,
	// The tutor's replies to a student.
	"app/_components/Course/components/LessonAssistant/index.tsx":
		modelOutputUrlPolicy,
	// The course builder's replies to an instructor.
	"app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatMessages/components/ChatMessage/index.tsx":
		modelOutputUrlPolicy,
};

export const POLICY_NAME: Map<UrlPolicy, string> = new Map([
	[authoredContentUrlPolicy, "authoredContentUrlPolicy"],
	[modelOutputUrlPolicy, "modelOutputUrlPolicy"],
]);
