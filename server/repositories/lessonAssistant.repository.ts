import type { LessonAssistantMessage, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";
import type LessonAssistantConversationRepository from "@/server/repositories/lessonAssistantConversation.repository";
import { lessonAssistantConversationRepository } from "@/server/repositories/lessonAssistantConversation.repository";

/**
 * Most-recent turns sent to the model. Bounds cost and latency the student
 * controls, and keeps the system prompt from being diluted as the conversation
 * grows — a guard that lives in the prompt weakens as its share of the context
 * shrinks.
 */
const MODEL_CONTEXT_MESSAGE_LIMIT = 20;

/**
 * The message count bounds neither of the things the limit above exists for.
 * Twenty turns at the 2,000-character input cap is ~40 KB, so a student writing
 * long messages gets 20× the prompt dilution of one writing short ones — exactly
 * backwards. Trimming is by WHOLE messages: a truncated turn is a new injection
 * primitive, not a saving.
 */
const MODEL_CONTEXT_CHAR_BUDGET = 8_000;

class LessonAssistantRepository extends BaseRepository<
	"lessonAssistantMessage",
	LessonAssistantMessage,
	Prisma.LessonAssistantMessageUncheckedCreateInput,
	Prisma.LessonAssistantMessageUpdateInput,
	Prisma.LessonAssistantMessageWhereInput,
	Prisma.LessonAssistantMessageInclude,
	Prisma.LessonAssistantMessageSelect,
	Prisma.LessonAssistantMessageOrderByWithRelationInput
> {
	protected readonly modelName = "lessonAssistantMessage";

	private conversationRepository: LessonAssistantConversationRepository;

	constructor() {
		super();
		this.conversationRepository = lessonAssistantConversationRepository;
	}

	/**
	 * The thread as the student's browser renders it: four fields, written out.
	 *
	 * `toolCalls` is deliberately absent, and absent by projection rather than by
	 * nothing being written there. It holds what the model asked each tool for,
	 * and `ask_concept_check`'s arguments are a question and its answer. This
	 * query is reachable by any enrolled student for their own thread, so a
	 * `select` that returned the whole row would ship the tutor's own answer key
	 * to the person meant to be answering it.
	 */
	async getMessages(lessonId: string, studentId: string) {
		const convo = await this.conversationRepository.findWithMessages(
			lessonId,
			studentId,
		);
		return convo?.messages ?? [];
	}

	/**
	 * The model-context read. Separate from getMessages on purpose: the thread
	 * read serves the UI and must show everything, including turns the guard
	 * rejected; this one must show neither those nor an unbounded history.
	 */
	async getContextMessages(
		lessonId: string,
		studentId: string,
		limit: number = MODEL_CONTEXT_MESSAGE_LIMIT,
	) {
		const convo = await this.conversationRepository.findByLessonAndStudent(
			lessonId,
			studentId,
		);
		if (!convo) return [];

		// Newest-first with `take`, then reversed: `orderBy asc` + `take` would
		// return the OLDEST N, which is the opposite of a recency window.
		const rows = await this.findMany({
			// Content only, and this is load-bearing rather than incidental: it is
			// what makes the answer key unrecoverable on the next turn. Anyone
			// adding tool-call replay "for continuity" would hand the model back the
			// question it just wrote and the option it marked correct, and nothing
			// about that change would look security-relevant.
			select: {
				id: true,
				role: true,
				content: true,
				createdAt: true,
				contextEligible: true,
			},
			where: { conversationId: convo.id, contextEligible: true },
			// createdAt is timestamp(3), so two rows written in the same millisecond
			// tie; without the id tiebreaker a user/assistant pair could invert or
			// a boundary row could flip in and out of the window.
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: limit,
		});

		// rows is newest-first here; keep taking while the budget allows, then flip
		// back to chronological order. The length guard keeps one message even when
		// it alone busts the budget — an empty context is worse than an oversized one.
		const kept: typeof rows = [];
		let used = 0;
		for (const row of rows) {
			if (
				kept.length > 0 &&
				used + row.content.length > MODEL_CONTEXT_CHAR_BUDGET
			) {
				break;
			}
			kept.push(row);
			used += row.content.length;
		}
		return kept.reverse();
	}

	async saveMessage(
		lessonId: string,
		studentId: string,
		message: {
			role: string;
			content: string;
			toolCalls?: unknown;
			contextEligible?: boolean;
		},
	) {
		const convo = await this.conversationRepository.getOrCreate(
			lessonId,
			studentId,
		);
		return this.createRaw({
			conversationId: convo.id,
			role: message.role,
			content: message.content,
			contextEligible: message.contextEligible ?? true,
			toolCalls:
				message.toolCalls !== undefined
					? (message.toolCalls as object)
					: undefined,
		});
	}

	/**
	 * Takes a message out of the model-context read while leaving it in the thread.
	 * Used when the OUTPUT boundary rejects a reply: the prompt that elicited it is
	 * the strongest adversarial signal available, and replaying it as ordinary
	 * history hands the payload a fresh sample of a stochastic model on every retry.
	 *
	 * Scoped by conversation even though the only caller passes a server-minted id
	 * from the same request: ownership belongs in the query that acts, not in the
	 * discipline of one call site (ADR-017 Rule 2). `updateMany` also makes a
	 * vanished row a no-op instead of a P2025 throw — the row really can vanish,
	 * because `clearHistory` is callable while a turn is still streaming.
	 */
	async markContextIneligible(
		messageId: string,
		lessonId: string,
		studentId: string,
	) {
		await this.updateMany(
			{ id: messageId, conversation: { lessonId, studentId } },
			{ contextEligible: false },
		);
	}

	async clearMessages(lessonId: string, studentId: string) {
		const convo = await this.conversationRepository.findByLessonAndStudent(
			lessonId,
			studentId,
		);
		if (!convo) return;
		await this.deleteMany({ conversationId: convo.id });
	}
}

export const lessonAssistantRepository = new LessonAssistantRepository();
