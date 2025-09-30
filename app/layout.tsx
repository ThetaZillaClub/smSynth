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
      {/* Stable default to avoid flashes before JS */}
      <head>
        <style id="sidebar-var-default">{`:root{--sidebar-w:0px}`}</style>
      </head>
      <body className={`${geistSans.className} antialiased`}>
        {/* Pre-hydration: set desired width ONLY on :root */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try {
    var p = location.pathname || "";
    var isAuth = p.startsWith("/auth");
    var collapsed = (typeof localStorage !== "undefined" && localStorage.getItem("sidebar:collapsed") === "1");
    var w = isAuth ? "0px" : (collapsed ? "64px" : "240px");
    document.documentElement.style.setProperty("--sidebar-w", w);
  } catch (e) {
    document.documentElement.style.setProperty("--sidebar-w", "0px");
  }
})();`,
          }}
        />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthAwareShell>{children}</AuthAwareShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
