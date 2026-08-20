import { memoryStore } from "./memory.store";
import type { RateLimitStore } from "./types";

export const rateLimitStore: RateLimitStore = memoryStore;
