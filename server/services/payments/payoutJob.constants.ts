/** FR-P3: ~1.5 s per payment keeps a run near 75 s of the 300 s Hobby limit (decision BATCH). */
export const PAYOUT_BATCH_SIZE = 50;
/** H7: longer than one Hobby run, so a crashed run cannot block the next day. */
export const PAYOUT_LOCK_TTL_MS = 15 * 60 * 1000;
