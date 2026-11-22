"use client";

import { createContext, useContext } from "react";
import type { RefundFlagProviderProps } from "./types";

const RefundFlagContext = createContext(false);

/**
 * U11: hands the server-read student-refund flag to client components that change text with it
 * (the course card, the purchase dialog). Display only — the server enforces the flag (C24).
 */
export const RefundFlagProvider = ({
	enabled,
	children,
}: RefundFlagProviderProps) => (
	<RefundFlagContext.Provider value={enabled}>
		{children}
	</RefundFlagContext.Provider>
);

export const useStudentRefundEnabled = (): boolean =>
	useContext(RefundFlagContext);
