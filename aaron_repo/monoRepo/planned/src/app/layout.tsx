import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScrumBoardHack",
  description: "A fast Kanban board for the hackathon",
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
