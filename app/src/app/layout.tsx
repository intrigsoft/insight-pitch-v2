import type { Metadata } from "next";
import { Geist, Newsreader, Noto_Sans_Sinhala, Noto_Sans_Tamil, Noto_Serif_Sinhala, Noto_Serif_Tamil } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], weight: ["400", "500", "600"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

// Sinhala and Tamil fallbacks. Their files are limited to those scripts by unicode-range,
// so browsers only download them when a page contains Sinhala or Tamil text.
const sansSinhala = Noto_Sans_Sinhala({ display: "swap", preload: false, variable: "--font-sans-si", subsets: ["sinhala"] });
const sansTamil = Noto_Sans_Tamil({ display: "swap", preload: false, variable: "--font-sans-ta", subsets: ["tamil"] });
const serifSinhala = Noto_Serif_Sinhala({ display: "swap", preload: false, variable: "--font-serif-si", subsets: ["sinhala"] });
const serifTamil = Noto_Serif_Tamil({ display: "swap", preload: false, variable: "--font-serif-ta", subsets: ["tamil"] });

export const metadata: Metadata = {
  title: "Insight Pitch",
  description: "Draft public proposals, publish them for discussion, and keep every version on the record.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const fonts = [geist, newsreader, sansSinhala, sansTamil, serifSinhala, serifTamil].map((f) => f.variable).join(" ");
  return (
    <html lang="en" className={fonts}>
      <body>{children}</body>
    </html>
  );
}
