import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NIVAAN",
  description: "Zero-knowledge compliance for the decentralized web",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link href="https://db.onlinewebfonts.com/c/13ab13418f633c1b0516fed6e30bedbc?family=Suisse+Int%27l" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
