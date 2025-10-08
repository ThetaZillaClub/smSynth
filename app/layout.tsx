// app/layout.tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import AuthAwareShell from "@/components/sidebar/AuthAwareShell";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "PitchTime.Pro",
  description: "The fastest way to become a professional vocalist",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Pre-paint: if we're on /auth, force 0px before any CSS; otherwise we'll default to 240px */}
        <script
          // Inline + synchronous so it runs before first paint
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname||"";if(p.startsWith("/auth")){document.documentElement.style.setProperty("--sidebar-w","0px");}}catch(e){}})();`,
          }}
        />
        {/* Default FIRST-PAINT width for all non-/auth pages */}
        <style id="sidebar-var-default">{`:root{--sidebar-w:240px}`}</style>
      </head>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthAwareShell>{children}</AuthAwareShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
