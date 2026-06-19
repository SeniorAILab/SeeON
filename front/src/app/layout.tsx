import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "행복한요양원 녹양역",
  description: "실시간 낙상 감지 및 입소자 안전 모니터링",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Warm canvas comes from globals.css (@theme tokens); Pretendard via CDN link.
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
