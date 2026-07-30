import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Magica Viewer — Drive History Explorer",
    description: "Open a Magica backup and explore your recorded routes privately in your browser.",
    openGraph: {
      title: "Magica Viewer",
      description: "View your Magica drive history on an interactive map.",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: "Magica Viewer",
      description: "View your Magica drive history on an interactive map.",
      images: [image],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
