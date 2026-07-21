import "./globals.css";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
export const metadata: Metadata = { title: "CloseLoop — Execution intelligence", description: "Close the loop between meetings and outcomes." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en" className="dark"><body><ClerkProvider>{children}</ClerkProvider></body></html>; }
