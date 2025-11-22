import DashboardLayout from "@/app/_components/Dashboard/Layout";

const DashboardRootLayout = ({ children }: { children: React.ReactNode }) => {
	return <DashboardLayout>{children}</DashboardLayout>;
};

export default DashboardRootLayout;
