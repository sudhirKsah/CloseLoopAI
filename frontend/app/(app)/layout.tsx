import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { AuthGuard } from "@/components/auth-guard";
import { SubscriptionGuard } from "@/components/subscription-guard";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SubscriptionGuard>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </SubscriptionGuard>
    </AuthGuard>
  );
}
