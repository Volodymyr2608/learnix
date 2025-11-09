import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { TRPCReactProvider } from "../lib/trpc/react";

import "styles/globals.css";

export const metadata: Metadata = {
	title: "Home | Learnix App",
	description: "Access world-class education from anywhere. Master new skills with expert-led courses, interactive projects, and a supportive learning community",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geistSans = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html className={`${geistSans.variable} ${geistMono.variable} antialiased`} lang="en">
			<body>
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	);
}
