import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppFrame } from "@/components/shell";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "国协云工",
  description: "国协云工集团有限公司远程办公与灵活用工平台。劳动员工与项目合作方严格分开。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geist.variable} min-h-screen antialiased`}>
        <SessionProvider>
          <AppFrame>{children}</AppFrame>
        </SessionProvider>
      </body>
    </html>
  );
}
