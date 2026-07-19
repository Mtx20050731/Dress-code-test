import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";
import "./style-system.css";

export const metadata: Metadata = {
  title: { default: "发现你的个人穿衣审美｜未定式", template: "%s｜未定式" },
  description: "上传你喜欢的穿搭图片，发现隐藏在颜色、廓形和材质中的个人审美偏好。",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4f1ea" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
