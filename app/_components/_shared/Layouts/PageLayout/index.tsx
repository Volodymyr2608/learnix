import {Header} from "@/app/_components/Header";
import Footer from "@/app/_components/Footer";

const PageLayout = ({
 children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <>
      <Header />
      <main>
        {children}
      </main>
      <Footer />
    </>
  )
}

export default PageLayout