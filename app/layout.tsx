import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "MandiLens | Procurement & Commodity Risk Intelligence",
  description: "Soybean mandi price analytics, transparent ML forecasting and procurement risk planning for India."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
