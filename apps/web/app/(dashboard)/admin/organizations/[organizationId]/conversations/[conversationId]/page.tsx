import { AdminConversationCostDetailView } from "@/modules/admin/ui/views/admin-conversation-cost-detail-view"

type Props = {
  params: Promise<{
    conversationId: string
    organizationId: string
  }>
}

export default function OrganizationConversationCostPage({ params }: Props) {
  return <AdminConversationCostDetailView params={params} />
}
