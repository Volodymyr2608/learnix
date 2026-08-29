export type CheckOptionProps = {
	option: string;
	isSelected: boolean;
	isLocked: boolean;
	onSelect: (option: string) => void;
};
