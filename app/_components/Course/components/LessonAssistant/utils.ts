/**
 * The URL decision for tutor replies now lives in
 * `app/_components/_shared/markdown/urlPolicy.ts` (modelOutputUrlPolicy), which
 * every markdown renderer shares. What was here — a second regex answering the
 * same question — is exactly the drift this feature exists to remove.
 */
export {};
