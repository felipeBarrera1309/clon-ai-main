import type { Id } from "@workspace/backend/_generated/dataModel"
import { OrderIdView } from "@/modules/dashboard/ui/views/order-id-view"

const Page = async ({
  params,
}: {
  params: Promise<{
    id: string
  }>
}) => {
  const { id } = await params

  return <OrderIdView orderId={id as Id<"orders">} />
}

export default Page
