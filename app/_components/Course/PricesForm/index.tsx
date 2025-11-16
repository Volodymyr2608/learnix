"use client";

import { useFormContext } from "react-hook-form";
import FormField from "@/app/_components/_shared/Form/FormField";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";

const PricesForm = () => {
	const {
		register,
		formState: { errors },
	} = useFormContext();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Pricing</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<FormField
					{...register("price")}
					autoComplete="off"
					error={
						typeof errors.price?.message === "string"
							? errors.price?.message
							: undefined
					}
					label="Price (USD) *"
					placeholder="89.99"
					type="number"
				/>

				<div className="space-y-2">
					<FormField
						{...register("originalPrice")}
						autoComplete="off"
						error={
							typeof errors.originalPrice?.message === "string"
								? errors.originalPrice?.message
								: undefined
						}
						label="Original Price (Optional)"
						placeholder="199.99"
						type="number"
					/>
					<p className="text-muted-foreground text-xs">
						Show a discount by setting an original price
					</p>
				</div>
			</CardContent>
		</Card>
	);
};

export default PricesForm;
