"use client";

import { useFormContext } from "react-hook-form";
import FormField from "@/app/_components/_shared/components/Form/FormField";
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
					{...register("priceCents", { valueAsNumber: true })}
					autoComplete="off"
					error={
						typeof errors.priceCents?.message === "string"
							? errors.priceCents?.message
							: undefined
					}
					label="Price (USD) *"
					placeholder="89.99"
					type="number"
				/>

				<div className="space-y-2">
					<FormField
						{...register("originalPriceCents", {
							setValueAs: (v) => {
								if (v === "" || v === null || v === undefined) return undefined;
								const n = Number(v);
								return Number.isNaN(n) ? undefined : n;
							},
						})}
						autoComplete="off"
						error={
							typeof errors.originalPriceCents?.message === "string"
								? errors.originalPriceCents?.message
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
