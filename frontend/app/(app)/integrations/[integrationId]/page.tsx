import { IntegrationDetailPage } from "@/components/integration-detail-page";
export default async function Page({
  params,
}: {
  params: Promise<{ integrationId: string }>;
}) {
  const { integrationId } = await params;
  return <IntegrationDetailPage integrationId={integrationId} />;
}
