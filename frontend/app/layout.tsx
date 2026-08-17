import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { SubscriptionProvider } from "@/components/subscription-provider";
import { ToastProvider } from "@/components/ui/toast";
export const metadata: Metadata = {
  title: "Pathayo — Execution intelligence powered by CloseLoop AI",
  description:
    "Pathayo sends an AI agent to your meetings, extracts every decision, and tracks it until shipped. Close the loop between meetings and outcomes.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthProvider>
          <SubscriptionProvider>
            <ToastProvider>{children}</ToastProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
