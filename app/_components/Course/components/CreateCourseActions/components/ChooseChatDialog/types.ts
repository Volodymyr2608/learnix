export type ChooseChatDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onContinueHandler: () => void;
	onNewChatHandler: () => void;
};
