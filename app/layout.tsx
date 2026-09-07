import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "PulseLog", description: "Fast Elasticsearch log discovery" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('pulselog-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t}catch(e){}})()` }}/></head><body>{children}</body></html>;
}
