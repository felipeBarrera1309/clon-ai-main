import { redirect } from "next/navigation"

export default async function AdminDebugAgentLegacyPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  redirect(`/admin/conversations/org/${organizationId}/agent`)
}
