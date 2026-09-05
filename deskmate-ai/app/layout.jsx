import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://deskmate-ai.vercel.app";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Deskmate AI — Your Workplace Assistant",
    template: "%s · Deskmate AI",
  },
  description:
    "Deskmate AI helps professionals automate workplace tasks with AI — email drafting, meeting summaries, task planning, research, and chat.",
  applicationName: "Deskmate AI",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Deskmate AI — Your Workplace Assistant",
    description:
      "Draft emails, summarize meetings, plan tasks, research topics, and chat — all powered by AI.",
    siteName: "Deskmate AI",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Deskmate AI — Your Workplace Assistant",
    description:
      "Draft emails, summarize meetings, plan tasks, research topics, and chat — all powered by AI.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport = {
  themeColor: "#065F46",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-stone-100 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
