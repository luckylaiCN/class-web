import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { clearUserSession, getCurrentUser } from "@/lib/auth"

export default async function HomePage() {
  const user = await getCurrentUser()

  async function logoutAction() {
    "use server"
    await clearUserSession()
    redirect("/")
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center gap-6 p-6">
      <Card className="overflow-hidden border-border/40 bg-gradient-to-br from-background via-background to-muted/40">
        <CardHeader>
          <Badge variant="outline" className="w-fit">
            Classroom App
          </Badge>
          <CardTitle className="mt-2 text-3xl">课堂互动系统</CardTitle>
          <CardDescription>
            管理员管理 class 会话并发布事件，用户实时参与投票和回答问题。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user ? (
            <div className="space-y-4">
              <p className="text-sm">
                当前登录：<span className="font-medium">{user.username}</span>
                <Badge className="ml-2" variant="secondary">
                  {user.role}
                </Badge>
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/class">进入会话列表</Link>
                </Button>
                <form action={logoutAction}>
                  <Button type="submit" variant="outline">
                    退出登录
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/user/login">登录</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/user/register">注册</Link>
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-end text-xs text-muted-foreground">Built with Next.js + shadcn/ui</CardFooter>
      </Card>
    </main>
  )
}
