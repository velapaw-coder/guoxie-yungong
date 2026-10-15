import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppFrame } from "@/components/shell";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "国协云工",
  description: "国协云工：国企运营的远程办公与灵活用工服务平台。劳动员工与项目合作方分开签约、分开核算。",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
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
