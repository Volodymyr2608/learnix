import type { BankFailureOutcome } from "./utils";

export type ResolveBankFailureDialogProps = {
	paymentId: string;
	outcome: BankFailureOutcome;
};
