import { Check, Clock, GraduationCap, Layers } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { CurriculumCardProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/CurriculumCard/types";
import NotYetGenerated from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/NotYetGenerated";
import { cn } from "@/lib/utils/cn";

const CurriculumCard = ({ curriculum, completed }: CurriculumCardProps) => {
	return (
		<Card className={cn("gap-2", { "opacity-40": curriculum.length === 0 })}>
			<CardHeader>
				<div className="flex items-center gap-2">
					<Layers className="h-4 w-4 text-muted-foreground" />
					<CardTitle className="text-sm">Curriculum</CardTitle>
					{completed && <Check className="ml-auto h-4 w-4 text-green-500" />}
				</div>
			</CardHeader>
			<CardContent className="text-sm">
				{curriculum.length > 0 ? (
					<div className="space-y-3">
						{curriculum.map((section, i) => (
							<div key={section.id}>
								<div className="flex items-center gap-2 font-medium">
									<span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary text-xs">
										Section {i + 1}
									</span>
									{section.title}
								</div>
								<ul className="mt-1.5 ml-4 space-y-1">
									{section.lessons.map((lesson) => (
										<li
											className="flex items-center justify-between text-muted-foreground"
											key={lesson.id}
										>
											<span className="flex items-center gap-1.5">
												<GraduationCap className="h-3 w-3" />
												{lesson.title}
											</span>
											<span className="flex items-center gap-1 text-xs">
												<Clock className="h-3 w-3" />
												{lesson.duration}
											</span>
										</li>
									))}
								</ul>
							</div>
						))}
						<div className="border-t pt-2 text-muted-foreground">
							{curriculum.length} sections,{" "}
							{curriculum.reduce((acc, s) => acc + s.lessons.length, 0)} lessons
						</div>
					</div>
				) : (
					<NotYetGenerated />
				)}
			</CardContent>
		</Card>
	);
};

export default CurriculumCard;
