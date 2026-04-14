"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

type AutoRefreshProps = {
  intervalMs?: number
  children: React.ReactNode
}

export function AutoRefresh({ intervalMs = 2000, children }: AutoRefreshProps) {
  const router = useRouter()

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh()
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [intervalMs, router])

  return <>{children}</>
}
