import { Separator } from "@/app/_components/_shared/ui/separator";

const SeparatorBlock = () => {
	return (
		<div className="relative">
			<div className="absolute inset-0 flex items-center">
				<Separator />
			</div>
			<div className="relative flex justify-center text-xs uppercase">
				<span className="bg-background px-2 text-muted-foreground">
					Or continue with email
				</span>
			</div>
		</div>
	);
};

export default SeparatorBlock;
