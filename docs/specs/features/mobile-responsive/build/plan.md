# Mobile Responsive Shell (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance criteria.

**Goal:** Make the dashboard shell and marketing header navigable on phone/tablet viewports by
replacing the fixed-sidebar layout with a CSS-breakpoint-driven layout plus a shared slide-in
drawer (`Sheet`), with zero visual change at `md` (768px) and above.

**Architecture:** A new `Sheet` UI primitive (Radix `Dialog` + `cva` side variants, mirroring the
existing `dialog.tsx`) provides the drawer shell. `DashboardSidebar` stays an **async Server
Component** — it still fetches session/counts once — but its inner markup is extracted into a
presentational `SidebarContent`, rendered twice: once inside a `hidden md:block` static `<aside>`
(desktop), once as the `children` of a client `MobileSidebarSheet` (mobile). A small client
`MobileNavProvider` context (in `Dashboard/Layout`) holds the drawer's `open` boolean so the
header's hamburger button and the sidebar's `Sheet` can share state despite living in different
server/client subtrees; it also closes the drawer on route change. The marketing header's mobile
nav is fully self-contained (own `Sheet`, no shared context needed) since trigger and content are
siblings in the same client component. No JS viewport-detection hook is introduced — every
breakpoint decision is plain Tailwind (`md:hidden` / `hidden md:block`).

**Tech Stack:** Next.js 16 App Router (Server + Client Components), `@radix-ui/react-dialog`
(already a dependency), `class-variance-authority`, `tw-animate-css` (already imported in
`styles/globals.css`, provides `slide-in-from-*`/`slide-out-to-*` utilities), Tailwind v4 default
breakpoints (`md` = 768px).

## Global Constraints

- Arrow-function consts for every new component/hook (no `function` declarations), except the new
  `Sheet` primitive in `_shared/ui/`, which mirrors the existing `function`-declaration style of
  its sibling `dialog.tsx` for consistency within that one vendored-style folder.
- One component per folder with a colocated `types.ts` **only when the component takes props**
  (no `types.ts` for zero-prop components — matches existing `Dashboard/Header`, `Dashboard/
  Sidebar` folders today).
- No nested ternaries (Biome `style/noNestedTernary`, error).
- At `md` (768px) and above, every changed page must render pixel-identical to current desktop
  output — these tasks only touch behavior below `md`.
- Use `dvh`-safe patterns where relevant; this PR has no fixed-height-on-mobile element, so it
  doesn't arise yet (will matter in the lesson-view/messaging follow-up PRs).

---

**Codebase anchors (verified during planning):**
- `cn()` (`lib/utils/cn.ts`) — `twMerge(clsx(inputs))`, used by every UI primitive.
- `Dialog`/`DialogContent` (`app/_components/_shared/ui/dialog.tsx:9-143`) — the exact
  Radix-wrapping pattern (`data-slot`, `cn(...)`, `showCloseButton` toggle) the new `Sheet`
  mirrors.
- `buttonVariants` / `Button` (`app/_components/_shared/ui/button.tsx`) — `variant="ghost"
  size="icon"` is the existing icon-button style to reuse for the hamburger triggers.
- `DashboardSidebar` (`app/_components/Dashboard/Sidebar/index.tsx:15-70`) — async Server
  Component; `requireAuth(await getSession())`, fetches `reviewsCount`/`unreadMessages` via
  `Promise.all`. This data-fetching shape does not change.
- `SidebarNavigation` (`app/_components/Dashboard/Sidebar/components/Navigation/index.tsx`) —
  already `"use client"` (uses `usePathname`), takes `NavigationProps` (`isInstructor`,
  `reviewsCount`, `unreadMessages`). Reused unchanged inside the new `SidebarContent`.
- `DashboardHeader` (`app/_components/Dashboard/Header/index.tsx:7-29`) — plain Server Component
  today (no `"use client"`); stays a Server Component, just renders one new client child.
- `DashboardLayout` (`app/_components/Dashboard/Layout/index.tsx:6-18`) — the `pl-64` offset and
  missing drawer slot this plan fixes.
- `Header` (`app/_components/Header/index.tsx`) — marketing nav, currently `export function
  Header()`; imported as `import { Header } from "@/app/_components/Header"` from
  `app/_components/_shared/components/Layouts/PageLayout/index.tsx:2` — must keep the same named
  export after converting to an arrow const.
- `Thread` (`app/_components/Messaging/MessagesView/components/Thread/index.tsx:9`) — the
  CLAUDE.md-cited canonical pattern (`export const X = (props: XProps) => {...}`) all new named
  components in this plan follow.
- `useDebouncedValue`/`useDragAndDrop` (`app/_components/_shared/hooks/`) — confirms shared hooks
  live as flat files in `_shared/hooks/`, not their own folders (not used in this plan, but
  matters if a future PR adds one).
- `capitalize.test.ts` (`lib/utils/capitalize.test.ts`) — the project's plain-Vitest unit test
  style (`describe`/`it`/`expect`, no mocking framework).

**Per-task conventions:**
- `pnpm typecheck` and `pnpm check` must be clean before every commit.
- This repo's Vitest unit project runs with `environment: "node"` and there is **no
  `jsdom`/`@testing-library/react` dependency** — there is no infrastructure to render React
  components or hooks in tests, and no existing precedent for it (zero `*.test.tsx` files exist).
  Per CLAUDE.md, frontend changes are verified by running the app in a browser, not by component
  unit tests. So: tasks that produce pure, DOM-free logic get a real failing-test-first TDD cycle
  (Task 1); tasks that produce JSX/DOM-coupled code skip the test-first steps and are verified by
  `pnpm typecheck && pnpm check` plus the manual browser pass in **Final verification** — this is
  called out explicitly per task rather than silently skipped.
- Commit messages: `feat(mobile): <summary>`.

---

## Task 1: `Sheet` UI primitive

**Files:**
- Create: `app/_components/_shared/ui/sheet.tsx`

**Interfaces:**
- Produces: `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent` (props: `side?: "left" | "right"
  | "top" | "bottom"`, `showCloseButton?: boolean`, plus all `DialogPrimitive.Content` props),
  `SheetHeader`, `SheetTitle`, `SheetDescription` — consumed by Tasks 4 and 8.

No test-first cycle (DOM-only primitive, mirrors the already-untested `dialog.tsx` — see
Per-task conventions).

- [ ] **Step 1: Implement**

```tsx
"use client";

import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils/cn";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
	return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
	return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
	return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
	return (
		<SheetPrimitive.Overlay
			className={cn(
				"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in",
				className,
			)}
			data-slot="sheet-overlay"
			{...props}
		/>
	);
}

const sheetContentVariants = cva(
	"fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:duration-300 data-[state=open]:duration-500",
	{
		variants: {
			side: {
				left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
				right:
					"inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
				top: "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
				bottom:
					"inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
			},
		},
		defaultVariants: {
			side: "right",
		},
	},
);

function SheetContent({
	className,
	children,
	side = "right",
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Content> &
	VariantProps<typeof sheetContentVariants> & {
		showCloseButton?: boolean;
	}) {
	return (
		<SheetPortal>
			<SheetOverlay />
			<SheetPrimitive.Content
				className={cn(sheetContentVariants({ side }), className)}
				data-slot="sheet-content"
				{...props}
			>
				{children}
				{showCloseButton && (
					<SheetPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
						<XIcon className="size-4" />
						<span className="sr-only">Close</span>
					</SheetPrimitive.Close>
				)}
			</SheetPrimitive.Content>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-1.5 p-4", className)}
			data-slot="sheet-header"
			{...props}
		/>
	);
}

function SheetTitle({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
	return (
		<SheetPrimitive.Title
			className={cn("font-semibold text-foreground", className)}
			data-slot="sheet-title"
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
	return (
		<SheetPrimitive.Description
			className={cn("text-muted-foreground text-sm", className)}
			data-slot="sheet-description"
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetOverlay,
	SheetPortal,
	SheetTitle,
	SheetTrigger,
};
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm check:write`
Expected: clean (Biome will sort the Tailwind classes/imports automatically).

- [ ] **Step 3: Commit**

```bash
git add app/_components/_shared/ui/sheet.tsx
git commit -m "feat(mobile): add Sheet drawer UI primitive"
```

---

## Task 2: `MobileNavProvider` (shared drawer-open context)

**Files:**
- Create: `app/_components/Dashboard/Layout/components/MobileNavProvider/index.tsx`
- Create: `app/_components/Dashboard/Layout/components/MobileNavProvider/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MobileNavProvider` (props: `MobileNavProviderProps = { children: ReactNode }`),
  `useMobileNav(): { open: boolean; setOpen: (open: boolean) => void }` — consumed by Tasks 4, 6,
  8.

- [ ] **Step 1: Implement `types.ts`**

```ts
import type { ReactNode } from "react";

export type MobileNavProviderProps = {
	children: ReactNode;
};
```

- [ ] **Step 2: Implement `index.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { MobileNavProviderProps } from "@/app/_components/Dashboard/Layout/components/MobileNavProvider/types";

type MobileNavContextValue = {
	open: boolean;
	setOpen: (open: boolean) => void;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export const MobileNavProvider = ({ children }: MobileNavProviderProps) => {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	return (
		<MobileNavContext.Provider value={{ open, setOpen }}>
			{children}
		</MobileNavContext.Provider>
	);
};

export const useMobileNav = (): MobileNavContextValue => {
	const context = useContext(MobileNavContext);
	if (!context) {
		throw new Error("useMobileNav must be used within a MobileNavProvider");
	}
	return context;
};
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm check:write`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Dashboard/Layout/components/MobileNavProvider
git commit -m "feat(mobile): add MobileNavProvider drawer-open context"
```

---

## Task 3: Extract `SidebarContent` from `DashboardSidebar`

**Files:**
- Create: `app/_components/Dashboard/Sidebar/components/SidebarContent/index.tsx`
- Create: `app/_components/Dashboard/Sidebar/components/SidebarContent/types.ts`
- Modify: `app/_components/Dashboard/Sidebar/index.tsx` (full rewrite, see Task 4 — this task only
  adds the new files; Task 4 wires them in)

**Interfaces:**
- Consumes: `SidebarNavigation` (`@/app/_components/Dashboard/Sidebar/components/Navigation`,
  default export, `NavigationProps`).
- Produces: `SidebarContent` (props: `SidebarContentProps = { name: string; role: Role;
  isInstructor: boolean; reviewsCount: number; unreadMessages: number }`) — consumed by Task 4.

- [ ] **Step 1: Implement `types.ts`**

```ts
import type { Role } from "@/generated/prisma";

export type SidebarContentProps = {
	name: string;
	role: Role;
	isInstructor: boolean;
	reviewsCount: number;
	unreadMessages: number;
};
```

- [ ] **Step 2: Implement `index.tsx`**

This is the exact inner markup currently in `Dashboard/Sidebar/index.tsx:27-67`, unchanged, moved
into its own component:

```tsx
import { GraduationCap } from "lucide-react";
import Link from "next/link";

import SidebarNavigation from "@/app/_components/Dashboard/Sidebar/components/Navigation";
import type { SidebarContentProps } from "@/app/_components/Dashboard/Sidebar/components/SidebarContent/types";
import { Role } from "@/generated/prisma";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { capitalize } from "@/lib/utils/capitalize";
import getInitials from "@/lib/utils/user/getInitials";
import getUserName from "@/lib/utils/user/getUserName";

export const SidebarContent = ({
	name,
	role,
	isInstructor,
	reviewsCount,
	unreadMessages,
}: SidebarContentProps) => {
	return (
		<div className="flex h-full flex-col">
			<div className="flex h-16 items-center border-sidebar-border border-b px-6">
				<Link
					className="flex items-center gap-2"
					href={
						isInstructor ? INSTRUCTOR_URLS.dashboard : STUDENT_URLS.dashboard
					}
				>
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
						<GraduationCap className="h-5 w-5 text-sidebar-primary-foreground" />
					</div>
					<span className="font-semibold text-lg text-sidebar-foreground">
						{isInstructor ? "Instructor" : "EduPlatform"}
					</span>
				</Link>
			</div>

			<SidebarNavigation
				isInstructor={isInstructor}
				reviewsCount={reviewsCount}
				unreadMessages={unreadMessages}
			/>

			<div className="border-sidebar-border border-t p-4">
				<div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary font-semibold text-sidebar-primary-foreground text-sm">
						{getInitials(name)}
					</div>
					<div className="flex-1 overflow-hidden">
						<p className="truncate font-medium text-sidebar-foreground text-sm">
							{getUserName(name)}
						</p>
						<p className="truncate text-sidebar-foreground/60 text-xs">
							{capitalize(role.toLowerCase())}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};
```

(`Role` import above is unused if TypeScript narrows `role` to the imported type only — keep the
type-only import in `types.ts`; do not import the `Role` enum value in `index.tsx` unless used.
Remove the `import { Role } from "@/generated/prisma"` line from this file — it's not referenced
here, only `role.toLowerCase()` is used, which needs no enum value import.)

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm check:write`
Expected: clean. (`SidebarContent` is not yet imported anywhere — this is expected; Task 4 wires
it in. `pnpm typecheck` still passes since the file is self-contained.)

- [ ] **Step 4: Commit**

```bash
git add app/_components/Dashboard/Sidebar/components/SidebarContent
git commit -m "feat(mobile): extract SidebarContent from DashboardSidebar"
```

---

## Task 4: `MobileSidebarSheet` + wire `DashboardSidebar` for desktop/mobile

**Files:**
- Create: `app/_components/Dashboard/Sidebar/components/MobileSidebarSheet/index.tsx`
- Create: `app/_components/Dashboard/Sidebar/components/MobileSidebarSheet/types.ts`
- Modify: `app/_components/Dashboard/Sidebar/index.tsx` (full file)

**Interfaces:**
- Consumes: `Sheet`, `SheetContent`, `SheetTitle` (Task 1); `useMobileNav` (Task 2);
  `SidebarContent` (Task 3).
- Produces: `MobileSidebarSheet` (props: `MobileSidebarSheetProps = { children: ReactNode }`).

- [ ] **Step 1: Implement `MobileSidebarSheet/types.ts`**

```ts
import type { ReactNode } from "react";

export type MobileSidebarSheetProps = {
	children: ReactNode;
};
```

- [ ] **Step 2: Implement `MobileSidebarSheet/index.tsx`**

```tsx
"use client";

import { useMobileNav } from "@/app/_components/Dashboard/Layout/components/MobileNavProvider";
import type { MobileSidebarSheetProps } from "@/app/_components/Dashboard/Sidebar/components/MobileSidebarSheet/types";
import {
	Sheet,
	SheetContent,
	SheetTitle,
} from "@/app/_components/_shared/ui/sheet";

export const MobileSidebarSheet = ({ children }: MobileSidebarSheetProps) => {
	const { open, setOpen } = useMobileNav();

	return (
		<Sheet onOpenChange={setOpen} open={open}>
			<SheetContent className="w-64 gap-0 border-sidebar-border bg-sidebar p-0" side="left">
				<SheetTitle className="sr-only">Navigation</SheetTitle>
				{children}
			</SheetContent>
		</Sheet>
	);
};
```

- [ ] **Step 3: Rewrite `Dashboard/Sidebar/index.tsx`**

```tsx
import { MobileSidebarSheet } from "@/app/_components/Dashboard/Sidebar/components/MobileSidebarSheet";
import { SidebarContent } from "@/app/_components/Dashboard/Sidebar/components/SidebarContent";
import { Role } from "@/generated/prisma";
import getNewReviewsCount from "@/lib/requests/instructor/getNewReviewsCount";
import getUnreadMessagesCount from "@/lib/requests/messages/getUnreadMessagesCount";
import requireAuth from "@/lib/utils/user/requireAuth";
import { getSession } from "@/server/better-auth/server";

const DashboardSidebar = async () => {
	const { user } = requireAuth(await getSession());

	const { name, role } = user;
	const isInstructor = role === Role.INSTRUCTOR;
	const [reviewsCount, unreadMessages] = await Promise.all([
		isInstructor ? getNewReviewsCount() : Promise.resolve(0),
		getUnreadMessagesCount(),
	]);

	return (
		<>
			<aside className="fixed top-0 left-0 z-40 hidden h-screen w-64 border-sidebar-border border-r bg-sidebar md:block">
				<SidebarContent
					isInstructor={isInstructor}
					name={name}
					reviewsCount={reviewsCount}
					role={role}
					unreadMessages={unreadMessages}
				/>
			</aside>
			<MobileSidebarSheet>
				<SidebarContent
					isInstructor={isInstructor}
					name={name}
					reviewsCount={reviewsCount}
					role={role}
					unreadMessages={unreadMessages}
				/>
			</MobileSidebarSheet>
		</>
	);
};

export default DashboardSidebar;
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm check:write`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/_components/Dashboard/Sidebar
git commit -m "feat(mobile): render sidebar as a drawer below md"
```

---

## Task 5: `MobileNavTrigger` + wire `DashboardHeader`

**Files:**
- Create: `app/_components/Dashboard/Header/components/MobileNavTrigger/index.tsx`
- Modify: `app/_components/Dashboard/Header/index.tsx` (full file)

**Interfaces:**
- Consumes: `useMobileNav` (Task 2); `Button` (`@/app/_components/_shared/ui/button`).
- Produces: `MobileNavTrigger` (no props — omit `types.ts`).

- [ ] **Step 1: Implement `MobileNavTrigger/index.tsx`**

```tsx
"use client";

import { Menu } from "lucide-react";

import { useMobileNav } from "@/app/_components/Dashboard/Layout/components/MobileNavProvider";
import { Button } from "@/app/_components/_shared/ui/button";

export const MobileNavTrigger = () => {
	const { setOpen } = useMobileNav();

	return (
		<Button
			aria-label="Open navigation menu"
			className="md:hidden"
			onClick={() => setOpen(true)}
			size="icon"
			variant="ghost"
		>
			<Menu className="h-5 w-5" />
		</Button>
	);
};
```

- [ ] **Step 2: Rewrite `Dashboard/Header/index.tsx`**

```tsx
import { Search } from "lucide-react";

import { MobileNavTrigger } from "@/app/_components/Dashboard/Header/components/MobileNavTrigger";
import Notifications from "@/app/_components/Dashboard/Header/components/Notifications";
import UserProfile from "@/app/_components/Dashboard/Header/components/UserProfile";
import { Input } from "@/app/_components/_shared/ui/input";

const DashboardHeader = () => {
	return (
		<header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-border border-b bg-background px-6">
			<MobileNavTrigger />

			<div className="hidden flex-1 sm:block">
				<div className="relative max-w-md">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						placeholder="Search courses, lessons..."
						type="search"
					/>
				</div>
			</div>

			<div className="ml-auto flex items-center gap-2">
				<Notifications />

				<UserProfile />
			</div>
		</header>
	);
};

export default DashboardHeader;
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm check:write`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Dashboard/Header
git commit -m "feat(mobile): add hamburger trigger to dashboard header"
```

---

## Task 6: Wire `MobileNavProvider` + fix sidebar offset in `DashboardLayout`

**Files:**
- Modify: `app/_components/Dashboard/Layout/index.tsx` (full file)

**Interfaces:**
- Consumes: `MobileNavProvider` (Task 2).

- [ ] **Step 1: Rewrite `Dashboard/Layout/index.tsx`**

```tsx
import type { PropsWithChildren } from "react";

import DashboardHeader from "@/app/_components/Dashboard/Header";
import { MobileNavProvider } from "@/app/_components/Dashboard/Layout/components/MobileNavProvider";
import DashboardSidebar from "@/app/_components/Dashboard/Sidebar";

const DashboardLayout = ({ children }: PropsWithChildren) => {
	return (
		<MobileNavProvider>
			<div className="flex h-screen overflow-hidden">
				<DashboardSidebar />
				<div className="flex flex-1 flex-col overflow-hidden md:pl-64">
					<DashboardHeader />
					<main className="flex-1 overflow-y-auto bg-muted/30 p-6">
						{children}
					</main>
				</div>
			</div>
		</MobileNavProvider>
	);
};

export default DashboardLayout;
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm check:write`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/_components/Dashboard/Layout/index.tsx
git commit -m "feat(mobile): remove fixed sidebar offset below md"
```

This is the task where the dashboard shell becomes usable on mobile end-to-end — do the manual
browser check from **Final verification** now before moving on, since Tasks 7–8 are independent
(marketing header) and a regression here is cheapest to catch immediately.

---

## Task 7: `MobileNav` for the marketing header

**Files:**
- Create: `app/_components/Header/components/MobileNav/index.tsx`
- Modify: `app/_components/Header/index.tsx` (full file)

**Interfaces:**
- Consumes: `Sheet`, `SheetTrigger`, `SheetContent`, `SheetTitle`, `SheetClose` (Task 1); `Button`.
- Produces: `MobileNav` (no props — omit `types.ts`).

- [ ] **Step 1: Implement `Header/components/MobileNav/index.tsx`**

```tsx
"use client";

import { Menu } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/_components/_shared/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/app/_components/_shared/ui/sheet";

const NAV_LINKS = [
	{ href: "/courses", label: "Courses" },
	{ href: "/programs", label: "Programs" },
	{ href: "/resources", label: "Resources" },
	{ href: "/pricing", label: "Pricing" },
	{ href: "/instructors", label: "Teach" },
];

export const MobileNav = () => {
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					aria-label="Open menu"
					className="md:hidden"
					size="icon"
					variant="ghost"
				>
					<Menu className="h-5 w-5" />
				</Button>
			</SheetTrigger>
			<SheetContent side="left">
				<SheetTitle className="sr-only">Menu</SheetTitle>
				<nav className="flex flex-col gap-1 p-4">
					{NAV_LINKS.map((link) => (
						<SheetClose asChild key={link.href}>
							<Link
								className="rounded-md px-3 py-2 font-medium text-sm hover:bg-accent"
								href={link.href}
							>
								{link.label}
							</Link>
						</SheetClose>
					))}
				</nav>
				<div className="mt-auto flex flex-col gap-2 border-t p-4">
					<SheetClose asChild>
						<Button asChild variant="ghost">
							<Link href="/sign-in">Sign In</Link>
						</Button>
					</SheetClose>
					<SheetClose asChild>
						<Button asChild>
							<Link href="/sign-up">Get Started</Link>
						</Button>
					</SheetClose>
				</div>
			</SheetContent>
		</Sheet>
	);
};
```

- [ ] **Step 2: Rewrite `Header/index.tsx`**

Same JSX as today, with `export function Header()` changed to the arrow-const form (matching the
`Thread` pattern), and `<MobileNav />` added next to the existing CTA buttons:

```tsx
import Link from "next/link";

import { MobileNav } from "@/app/_components/Header/components/MobileNav";
import Logo from "@/app/_components/_shared/components/Logo";
import { Button } from "@/app/_components/_shared/ui/button";

export const Header = () => {
	return (
		<header className="border-border border-b bg-background">
			<div className="container mx-auto flex h-16 items-center justify-between px-4">
				<div className="flex items-center gap-8">
					<Logo />

					<nav className="hidden items-center gap-6 md:flex">
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/courses"
						>
							Courses
						</Link>
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/programs"
						>
							Programs
						</Link>
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/resources"
						>
							Resources
						</Link>
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/pricing"
						>
							Pricing
						</Link>
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/instructors"
						>
							Teach
						</Link>
					</nav>
				</div>

				<div className="flex items-center gap-4">
					<Button asChild className="hidden sm:inline-flex" variant="ghost">
						<Link href="/sign-in">Sign In</Link>
					</Button>
					<Button asChild>
						<Link href="/sign-up">Get Started</Link>
					</Button>
					<MobileNav />
				</div>
			</div>
		</header>
	);
};
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm check:write`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Header
git commit -m "feat(mobile): add hamburger drawer to marketing header"
```

---

## Self-review

- **Spec coverage:**
  - "responsive dashboard shell... drawer... hamburger" → Tasks 2–6.
  - "shared Sheet/drawer UI primitive" → Task 1.
  - "marketing header exposes nav via mobile drawer" → Task 7.
  - Lesson view / messaging / browse-account acceptance criteria are explicitly **out of scope**
    for this build/plan.md — they're follow-up PRs per `spec.md`'s Agent notes (this plan covers
    the foundation only). No gap: this file only claims to satisfy the shell + marketing-nav
    criteria.
- **Placeholder scan:** no `TBD`/`TODO`/"handle edge cases" — clean.
- **Type consistency:** `SidebarContentProps`, `MobileNavProviderProps`,
  `MobileSidebarSheetProps` names and shapes are identical between their `types.ts` definition and
  every consuming call site above.

## Final verification

- `pnpm typecheck` and `pnpm check` both clean after all 7 tasks.
- `pnpm test:unit` still green (no unit tests changed; confirms nothing else broke).
- Manual (per CLAUDE.md "for UI changes, use the feature in a browser before reporting
  complete"), using the Playwright MCP tools:
  1. `pnpm dev`, navigate to `/dashboard` signed in as a student.
  2. `browser_resize` to 375×812. Confirm: no horizontal scroll, search bar hidden, hamburger
     visible, sidebar not visible.
  3. `browser_click` the hamburger. Confirm the drawer slides in from the left with nav links,
     user footer, and unread-message badge.
  4. `browser_click` a nav link inside the drawer. Confirm navigation happens **and** the drawer
     closes automatically.
  5. `browser_resize` to 820×1180 (tablet). Repeat steps 2–4.
  6. `browser_resize` to 1280×800 (desktop). Confirm the layout is pixel-identical to the
     pre-change screenshot (static sidebar visible, no hamburger, full search bar).
  7. Navigate to `/` (marketing homepage) at 375×812. Confirm the hamburger opens a drawer with
     all five nav links plus Sign In / Get Started, and each closes the drawer on click.
  8. Repeat for `/instructor` dashboard as an instructor user (same shell, different nav items)
     to confirm the shared shell change didn't regress the instructor role.
- Acceptance criteria from `spec.md` covered by this PR: the dashboard-drawer criterion, the
  desktop-regression criterion, and the marketing-nav criterion. (Lesson-view, messaging, and
  browse/account criteria remain open until their follow-up PRs.)