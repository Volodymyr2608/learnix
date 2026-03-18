import Footer from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";

const PageLayout = ({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) => {
	return (
		<>
			<Header />
			<main>{children}</main>
			<Footer />
		</>
	);
};

export default PageLayout;
