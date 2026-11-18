import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import "nextra-theme-docs/style.css";
import type { ReactNode } from "react";
import { Logo } from "../components/logo";

export const metadata = {
  title: {
    default: "vitest-cucumber",
    template: "%s – vitest-cucumber",
  },
  description: "Vitest plugin for Cucumber",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={
            <Navbar
              logo={<Logo />}
              projectLink="https://github.com/lotun-io/vitest-cucumber"
              chatLink="https://discord.gg/dfJUkmEtAP"
            />
          }
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/lotun-io/vitest-cucumber/tree/main/docs"
          footer={<Footer>MIT {new Date().getFullYear()} © Lotun</Footer>}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
