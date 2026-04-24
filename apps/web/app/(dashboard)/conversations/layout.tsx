"use client"

import { useParams } from "next/navigation"
import { ConversationsLayout } from "@/modules/dashboard/ui/layouts/conversations-layout"

const Layout = ({ children }: { children: React.ReactNode }) => {
	const params = useParams()
	const conversationId = params?.conversationId as string | undefined

	return (
		<ConversationsLayout selectedConversationId={conversationId}>
			{children}
		</ConversationsLayout>
	)
}

export default Layout
