import type { Metadata } from "next";
import { CursorGridBackground } from "@/components/cursor-grid-background";
import "./globals.css";

export const metadata: Metadata = {
  title: "TAPPED.RO — ARENA.TAPPED.RO",
  description: "The TAPPED.RO Counter-Strike community portal for ARENA 1v1s, duels, VIP, rankings, and loadouts."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CursorGridBackground />
        <div className="portal-content">{children}</div>
      </body>
    </html>
  );
}
