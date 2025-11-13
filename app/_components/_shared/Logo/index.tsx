import { BookOpen } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants/projectName";

const Logo = () => {
	return (
		<Link className="flex items-center gap-2" href="/">
			<BookOpen className="h-6 w-6" />
			<span className="font-semibold text-xl">{APP_NAME}</span>
		</Link>
	);
};

export default Logo;
