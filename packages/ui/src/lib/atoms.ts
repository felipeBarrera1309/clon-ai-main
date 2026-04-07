import { atom } from "jotai"

export const dashboardScrollAreaChildPropsAtom = atom<
  React.HTMLAttributes<HTMLElement>
>({
  style: { display: "block" },
})

export const dashboardScrollAreaDivPropsAtom = atom<
  React.HTMLAttributes<HTMLElement>
>({
  className: "container mx-auto flex h-full flex-col gap-3 p-2.5",
})
