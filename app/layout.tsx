import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Roadprint — Magica Drive Visualizer",
    description: "Turn your Magica backup into a private heatmap of the roads you drive most.",
    openGraph: { title: "Roadprint", description: "See the roads you really drive.", images: [image] },
    twitter: { card: "summary_large_image", title: "Roadprint", description: "See the roads you really drive.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
