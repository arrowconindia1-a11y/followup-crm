import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FollowUp AI CRM",
    template: "%s · FollowUp AI CRM",
  },
  description:
    "Never miss a follow-up. Zero-cost CRM built on Vercel Hobby + Supabase Free.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
