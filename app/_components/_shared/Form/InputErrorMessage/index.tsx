import type { InputErrorMessageProps } from "@/app/_components/_shared/Form/InputErrorMessage/types";

const InputErrorMessage = ({ name, error }: InputErrorMessageProps) => {
	if (!error) return null;

	return (
		<p className="text-destructive text-sm" id={`${name}-error`}>
			{error}
		</p>
	);
};

export default InputErrorMessage;
