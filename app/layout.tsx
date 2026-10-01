import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  title: "Kargo Hiring",
  description: "Ranked PM / SPM shortlist, interview briefs and candidate emails",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <div className="planet" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
