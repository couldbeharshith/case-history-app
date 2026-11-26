import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "../components/Sidebar";
import SidebarProvider from "../components/SidebarProvider";

export const metadata: Metadata = {
  title: "CaseFlow — eCourts Case Summary",
  description: "AI-powered Indian court case summary and intelligence tool",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased">
        <SidebarProvider>
          <div className="app-shell flex h-dvh overflow-hidden">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}
