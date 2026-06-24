export function InboxEmpty() {
	return (
		<div className="px-4 py-8 text-center">
			<p className="font-medium text-sm">No conversations yet</p>
			<p className="mt-1 text-muted-foreground text-xs">
				Messages you send and receive will show up here.
			</p>
		</div>
	);
}
