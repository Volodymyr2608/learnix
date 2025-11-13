"use client";

import { Eye, EyeClosed } from "lucide-react";
import { useState } from "react";
import { Input } from "@/app/_components/_shared/ui/input";
import type { InputPasswordProps } from "./types";

const InputPassword = (props: InputPasswordProps) => {
	const {
		id,
		placeholder = "Your password",
		className = "",
		iconSize = 4,
		type = "password",
		...otherProps
	} = props;
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);

	const togglePasswordVisibility = () => {
		setIsPasswordVisible((prevState) => !prevState);
	};

	const iconClassName = `h-${iconSize} w-${iconSize} cursor-pointer`;
	const Icon = isPasswordVisible ? Eye : EyeClosed;

	return (
		<div className="relative w-full">
			<Input
				className={className}
				id={id}
				placeholder={placeholder}
				type={isPasswordVisible ? "text" : type}
				{...otherProps}
			/>
			<div className="-translate-y-1/2 absolute top-1/2 right-1 p-2">
				<Icon className={iconClassName} onClick={togglePasswordVisibility} />
			</div>
		</div>
	);
};

export default InputPassword;
