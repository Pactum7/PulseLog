import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "PulseLog", description: "Fast Elasticsearch log discovery" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
