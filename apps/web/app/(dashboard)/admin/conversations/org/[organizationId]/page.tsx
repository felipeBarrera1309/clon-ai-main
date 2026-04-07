import { AdminDebugConversationsByOrgView } from "@/modules/admin/ui/views/admin-debug-conversations-by-org-view"

export default async function AdminDebugConversationsByOrgPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params

  return <AdminDebugConversationsByOrgView organizationId={organizationId} />
}
