"use client";

import { Award, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/app/_components/_shared/ui/dialog";
import type { PurchaseConfirmDialogProps } from "@/app/_components/Course/components/PurchaseConfirmDialog/types";
import { formatPrice } from "@/lib/formatPrice";
import { api } from "@/trpc/client";

const PurchaseConfirmDialog = ({
	open,
	onOpenChange,
	course,
}: PurchaseConfirmDialogProps) => {
	const checkout = api.payment.createCheckoutSession.useMutation({
		onSuccess: ({ url }) => {
			window.location.href = url;
		},
		onError: (err) => {
			toast.error(err.message || "Failed to start checkout. Please try again.");
		},
	});

	const handleClose = () => {
		if (checkout.isPending) return;
		onOpenChange(false);
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Purchase this course?</DialogTitle>
					<DialogDescription>
						Review your purchase before continuing to secure checkout.
					</DialogDescription>
				</DialogHeader>

				<div className="flex gap-4 py-4">
					<div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
						<Image
							alt={course.title}
							className="object-cover"
							fill
							src={course.thumbnail || "/placeholder.svg"}
						/>
					</div>
					<div className="flex flex-col justify-center">
						<h4 className="line-clamp-2 font-medium">{course.title}</h4>
						<p className="text-muted-foreground text-sm">
							by {course.instructor}
						</p>
					</div>
				</div>

				<div className="flex items-baseline justify-between rounded-lg bg-muted/50 px-4 py-3">
					<span className="text-muted-foreground text-sm">Total</span>
					<span className="font-bold text-2xl">
						{formatPrice(course.priceCents)}
					</span>
				</div>

				<div className="space-y-2 py-2">
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<CheckCircle2 className="h-4 w-4 text-green-500" />
						<span>Full lifetime access to all course content</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<Award className="h-4 w-4 text-green-500" />
						<span>Certificate of completion</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<ShieldCheck className="h-4 w-4 text-green-500" />
						<span>30-day money-back guarantee</span>
					</div>
				</div>

				<div className="flex gap-3 pt-4">
					<Button
						className="flex-1 bg-transparent"
						disabled={checkout.isPending}
						onClick={handleClose}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						className="flex-1"
						disabled={checkout.isPending}
						onClick={() => checkout.mutate({ courseId: course.id })}
					>
						{checkout.isPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Redirecting...
							</>
						) : (
							"Proceed to Checkout"
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default PurchaseConfirmDialog;
