import type { Metadata } from "next";
import { AppProviders } from "@/components/providers";
import { IncidentBannerHost } from "@/components/IncidentBannerHost";
import "./globals.css";

const geistSans = { variable: "font-sans" };
const geistMono = { variable: "font-mono" };

export const metadata: Metadata = {
  title: "LumenMap",
  description:
    "Stellar network activity dashboard. Daily volume, active wallets, top dApps, and treemap analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-foreground">
        <AppProviders>
          <IncidentBannerHost />
          <main className="min-h-screen">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
