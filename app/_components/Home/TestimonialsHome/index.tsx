import { Star } from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Card } from "@/app/_components/_shared/ui/card";
import generateListWithIds from "@/lib/utils/generateListWithIds";

const testimonials = [
	{
		name: "Sarah Johnson",
		role: "Software Developer",
		avatar: "/professional-woman-smiling.png",
		content:
			"This platform transformed my career. The courses are well-structured and the instructors are incredibly knowledgeable. I landed my dream job within 3 months!",
		rating: 5,
	},
	{
		name: "Michael Chen",
		role: "Data Analyst",
		avatar: "/professional-man-smiling.png",
		content:
			"The best investment I've made in my education. The hands-on projects and real-world examples made learning practical and engaging.",
		rating: 5,
	},
	{
		name: "Emily Rodriguez",
		role: "UX Designer",
		avatar: "/professional-woman-designer.png",
		content:
			"I love the flexibility and quality of content. Being able to learn at my own pace while getting support from the community has been amazing.",
		rating: 5,
	},
];

const TestimonialsHome = () => {
	return (
		<section className="bg-muted/30 px-4 py-24">
			<div className="container mx-auto max-w-7xl">
				<div className="mb-16 text-center">
					<h2 className="mb-4 font-bold text-4xl">What Our Students Say</h2>
					<p className="mx-auto max-w-2xl text-lg text-muted-foreground">
						Join thousands of successful learners who have transformed their
						careers
					</p>
				</div>

				<div className="grid gap-8 md:grid-cols-3">
					{testimonials.map((testimonial) => (
						<Card className="p-6" key={testimonial.name}>
							<div className="mb-4 flex gap-1">
								{generateListWithIds(testimonial.rating).map(({ id }) => (
									<Star
										className="h-5 w-5 fill-primary text-primary"
										key={id}
									/>
								))}
							</div>
							<p className="mb-6 text-muted-foreground">
								{testimonial.content}
							</p>
							<div className="flex items-center gap-3">
								<Avatar>
									<AvatarImage
										alt={testimonial.name}
										src={testimonial.avatar || "/placeholder.svg"}
									/>
									<AvatarFallback>
										{testimonial.name
											.split(" ")
											.map((n) => n[0])
											.join("")}
									</AvatarFallback>
								</Avatar>
								<div>
									<p className="font-semibold">{testimonial.name}</p>
									<p className="text-muted-foreground text-sm">
										{testimonial.role}
									</p>
								</div>
							</div>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
};

export default TestimonialsHome;
