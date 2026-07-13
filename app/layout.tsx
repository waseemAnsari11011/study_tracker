import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyTrack - SSC CGL Progress Tracker",
  description:
    "Track question attempts, learning notes, review queues, and subject lecture completion dates.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
