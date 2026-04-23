import { Star } from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import { Separator } from "@/app/_components/_shared/ui/separator";
import type { StudentFeedbackCardProps } from "@/app/_components/Course/components/BrowseCourse/StudentFeedbackCard/types";
import generateListWithIds from "@/lib/utils/generateListWithIds";

const StudentFeedbackCard = ({
	reviews,
	rating,
	ratingDistribution,
}: StudentFeedbackCardProps) => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Student feedback</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="flex items-center gap-8">
					<div className="text-center">
						<div className="font-bold text-5xl">{rating}</div>
						<div className="mt-2 flex items-center justify-center gap-1">
							{generateListWithIds(5).map(({ id }) => (
								<Star
									className="h-4 w-4 fill-yellow-400 text-yellow-400"
									key={id}
								/>
							))}
						</div>
						<p className="mt-1 text-muted-foreground text-sm">Course Rating</p>
					</div>
					<div className="flex-1 space-y-2">
						{ratingDistribution.map(({ stars, percentage }) => (
							<div className="flex items-center gap-2" key={stars}>
								<Progress className="h-2" value={percentage} />
								<div className="flex w-20 items-center gap-1 text-sm">
									<Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
									<span>{stars}</span>
									<span className="text-muted-foreground">{percentage}%</span>
								</div>
							</div>
						))}
					</div>
				</div>

				<Separator />

				<div className="space-y-6">
					{reviews.map((review) => (
						<div className="space-y-2" key={review.id}>
							<div className="flex items-start gap-3">
								<Avatar>
									<AvatarImage src={review.avatar || "/placeholder.svg"} />
									<AvatarFallback>{review.name[0]}</AvatarFallback>
								</Avatar>
								<div className="flex-1 space-y-1">
									<div className="flex items-center justify-between">
										<h4 className="font-semibold text-sm">{review.name}</h4>
										<span className="text-muted-foreground text-xs">
											{review.date}
										</span>
									</div>
									<div className="flex items-center gap-1">
										{generateListWithIds(review.rating).map(({ id }) => (
											<Star
												className="h-3 w-3 fill-yellow-400 text-yellow-400"
												key={id}
											/>
										))}
									</div>
									<p className="text-muted-foreground text-sm">
										{review.comment}
									</p>
								</div>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
};

export default StudentFeedbackCard;
