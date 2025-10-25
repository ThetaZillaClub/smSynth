// app/layout.tsx
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
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

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Pre-paint: if we're on /auth, force 0px before any CSS; otherwise we'll default to open width */}
        <script
          // Inline + synchronous so it runs before first paint
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname||"";if(p.startsWith("/auth")){document.documentElement.style.setProperty("--sidebar-w","0px");}}catch(e){}})();`,
          }}
        />
        {/* Default FIRST-PAINT width for all non-/auth pages */}
        <style id="sidebar-var-default">{`:root{
  /* Open (expanded) sidebar width, proportionally clamped for all screens */
  --sidebar-w-open: clamp(192px, 15vw, 240px);
  /* Live width read by the app shell grid (toggled between collapsed/open) */
  --sidebar-w: var(--sidebar-w-open);
  /* Optional: scale the brand/icon with the sidebar width for nicer proportions */
  --sidebar-icon: clamp(20px, calc(var(--sidebar-w) * 0.16), 36px);
}`}</style>
      </head>
      <body className={`${poppins.className} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthAwareShell>{children}</AuthAwareShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
