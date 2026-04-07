import { AdminDebugConversationDetailView } from "@/modules/admin/ui/views/admin-debug-conversation-detail-view"

export default function AdminDebugConversationDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>
}) {
  return <AdminDebugConversationDetailView params={params} />
}
