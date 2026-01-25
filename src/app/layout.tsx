import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FBL 통합 업무 시스템",
  description: "FBL Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
