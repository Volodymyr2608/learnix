import { RunnableParallel } from "@langchain/core/runnables";
import { conceptsChain } from "./concepts.chain";
import { glossaryChain } from "./glossary.chain";
import { summaryChain } from "./summary.chain";

const parallel = RunnableParallel.from({
	summary: summaryChain,
	concepts: conceptsChain,
	glossary: glossaryChain,
});

export const insightsChain = parallel.withRetry({ stopAfterAttempt: 2 });
