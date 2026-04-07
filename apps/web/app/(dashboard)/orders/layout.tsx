"use client"

import { useParams } from "next/navigation"
import { OrdersLayout } from "@/modules/dashboard/ui/layouts/orders-layout"

const Layout = ({ children }: { children: React.ReactNode }) => {
  const params = useParams()
  const orderId = params?.id as string | undefined

  return <OrdersLayout selectedOrderId={orderId}>{children}</OrdersLayout>
}

export default Layout
