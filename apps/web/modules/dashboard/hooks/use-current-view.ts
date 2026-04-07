import { useSetAtom } from "jotai"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { currentViewAtom } from "../atoms"
import { DASHBOARD_VIEWS, type DashboardViewKey } from "../constants"

export const useCurrentView = () => {
  const pathname = usePathname()
  const router = useRouter()
  const setCurrentView = useSetAtom(currentViewAtom)

  useEffect(() => {
    // Buscar la vista correspondiente en la configuración
    const viewKey = Object.keys(DASHBOARD_VIEWS).find((key) => {
      if (key === "/") {
        return pathname === "/"
      }
      return pathname.startsWith(key)
    }) as DashboardViewKey | undefined

    if (viewKey) {
      const viewConfig = DASHBOARD_VIEWS[viewKey]
      setCurrentView({
        title: viewConfig.title,
        icon: viewConfig.icon,
      })
    } else {
      // Vista por defecto si no se encuentra coincidencia
      setCurrentView({
        title: "Dashboard",
        icon: DASHBOARD_VIEWS["/"].icon,
      })
    }
  }, [pathname, setCurrentView])

  // Función para navegar y colapsar sidebar en móvil
  const navigateAndCollapse = (url: string) => {
    // Cerrar sidebar móvil antes de navegar
    const sidebarEvent = new CustomEvent("close-mobile-sidebar")
    window.dispatchEvent(sidebarEvent)

    // Navegar a la nueva ruta
    router.push(url)
  }

  return { navigateAndCollapse }
}
