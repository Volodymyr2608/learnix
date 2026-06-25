export type CheckEmailMessageProps = {
	isPending: boolean;
	secondsLeft: number;
	onResend: () => void;
};

export type ResendButtonContentProps = {
	isPending: boolean;
	secondsLeft: number;
};
