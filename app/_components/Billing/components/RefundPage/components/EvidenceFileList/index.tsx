import { FileDown } from "lucide-react";
import { evidenceHref } from "../../utils";
import type { EvidenceFileListProps } from "./types";

/** C20: file names are text; each link goes through the authorizing download route. */
export const EvidenceFileList = ({ files }: EvidenceFileListProps) => {
	if (files.length === 0) return null;
	return (
		<ul className="space-y-1 text-sm">
			{files.map((file) => (
				<li key={file.id}>
					<a
						className="inline-flex items-center gap-1.5 underline underline-offset-2"
						href={evidenceHref(file.id)}
					>
						<FileDown className="h-3.5 w-3.5" />
						{file.fileName}
					</a>
				</li>
			))}
		</ul>
	);
};
