import type { ReactNode } from "react";

export type RefundFlagProviderProps = {
	/** Read on the server by `isStudentRefundEnabled()`; the client never decides it. */
	enabled: boolean;
	children: ReactNode;
};
