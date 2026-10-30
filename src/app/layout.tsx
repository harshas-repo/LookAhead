import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/session-context";

export const metadata: Metadata = {
  title: "LookAhead",
  description:
    "A calm, private space to explore and rehearse appearance choices as you prepare for treatment-related hair loss.",
  applicationName: "LookAhead",
  icons: { icon: "/images/logo.png", apple: "/images/logo.png" }
};

export const viewport: Viewport = {
  themeColor: "#FBF7F0",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
