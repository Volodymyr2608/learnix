import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/app/_components/_shared/ui/sonner";
import { TRPCReactProvider } from "@/trpc/client";

import "styles/globals.css";

export const metadata: Metadata = {
	title: "Home | Learnix App",
	description:
		"Access world-class education from anywhere. Master new skills with expert-led courses, interactive projects, and a supportive learning community",
	manifest: "/site.webmanifest",
	icons: [
		{ rel: "icon", url: "/favicon.ico" },
		{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
		{
			rel: "icon",
			url: "/favicon-96x96.png",
			sizes: "96x96",
			type: "image/png",
		},
		{ rel: "apple-touch-icon", url: "/apple-touch-icon.png" },
	],
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
		<html
			className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			lang="en"
		>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(i,s,o,g,r,a,m){
						i["esSdk"] = r;
						i[r] = i[r] || function() {
						(i[r].q = i[r].q || []).push(arguments)
						}, a=s.createElement(o), m=s.getElementsByTagName(o)[0]; a.async=1; a.src=g;
						m.parentNode.insertBefore(a,m)}
						) (window, document, "script", "https://esputnik.com/scripts/v1/public/scripts?apiKey=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI0NTI0ZWZhYTJkYzI2MGRmYTM4YTE1NDBlMWFmYjA0NmRiYmUzMDFiMmIxYzhhYzE1YzhhNDc3MmQzOGE0MDQzMjVhZWZlN2EwMGY1YTkyOTM1MGU2ZGY5ZGUyNmZkMDA0NWJjYjAwMzU1Mzg3MmJhYWYyMjA1ZDIzNTFmYzYxNGIzYzBhZTM2MzI3NDYxNTRiOTczZjQ3ZmVmZDQ1MTFhMDY4Y2UzOTM5ZTE5NjE1ZWYxMGFhYzk0OTBlNCJ9.CH5IIkM532qWy4DhP_awysNG8goELqQ0sDGad1c2adn7961VckrD44apG4nvQO4NWDw6NVmyeXQUd1GjAFYKQw&domain=2A249C2F-A051-4E84-B4D3-2971BDF61901", "es");
						es("pushOn", {
							'service-worker': {
								relUrl: '/push/esputnik/push-esputnik-sw.js'
							}
						});`,
					}}
				/>
			</head>
			<body>
				<TRPCReactProvider>{children}</TRPCReactProvider>
				<Toaster />
			</body>
		</html>
	);
}
