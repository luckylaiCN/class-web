import Link from "next/link"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { clearUserSession, getCurrentUser } from "@/lib/auth"
import {
  createClassSession,
  deleteClassSession,
  listClasses,
  setClassStatus,
  type ClassStatus,
} from "@/lib/db"

export default async function ClassListPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/user/login")
  }

  const classes = listClasses(user.role)

  async function logoutAction() {
    "use server"
    await clearUserSession()
    redirect("/")
  }

  async function createClassAction(formData: FormData) {
    "use server"

    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== "admin") {
      redirect("/class")
    }

    const title = String(formData.get("title") || "").trim()
    if (!title) {
      redirect("/class")
    }

    createClassSession(title, currentUser.id)
    revalidatePath("/class")
    redirect("/class")
  }

  async function updateStatusAction(classId: number, status: ClassStatus) {
    "use server"

    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== "admin") {
      redirect("/class")
    }

    setClassStatus(classId, status)
    revalidatePath("/class")
    revalidatePath(`/class/${classId}`)
    redirect("/class")
  }

  async function deleteClassAction(classId: number) {
    "use server"

    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== "admin") {
      redirect("/class")
    }

    deleteClassSession(classId)
    revalidatePath("/class")
    redirect("/class")
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-2xl">Class 会话列表</CardTitle>
            <CardDescription>
              当前登录：{user.username}
              <Badge className="ml-2" variant="secondary">
                {user.role}
              </Badge>
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/">返回首页</Link>
            </Button>
            <form action={logoutAction}>
              <Button type="submit" variant="outline">
                退出登录
              </Button>
            </form>
          </div>
        </CardHeader>
      </Card>

      {user.role === "admin" ? (
        <Card>
          <CardHeader>
            <CardTitle>新建会话</CardTitle>
            <CardDescription>创建后可在详情页发布投票与询问事件。</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createClassAction} className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1 space-y-2">
                <Label htmlFor="title">会话名称</Label>
                <Input id="title" name="title" required placeholder="输入会话名称" />
              </div>
              <Button type="submit">创建</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>可见会话</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无会话</p>
          ) : (
            classes.map((item) => {
              const nextStatus: ClassStatus = item.status === "active" ? "inactive" : "active"
              const statusLabel = item.status === "active" ? "活跃" : "未激活"

              return (
                <article key={item.id} className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>ID: {item.id}</span>
                        <Badge variant="outline">{statusLabel}</Badge>
                        <span>创建者: {item.created_by}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href={`/class/${item.id}`}>进入</Link>
                      </Button>
                      {user.role === "admin" ? (
                        <>
                          <form action={updateStatusAction.bind(null, item.id, nextStatus)}>
                            <Button type="submit" size="sm" variant="outline">
                              {item.status === "active" ? "注销" : "激活"}
                            </Button>
                          </form>
                          <form action={deleteClassAction.bind(null, item.id)}>
                            <Button type="submit" size="sm" variant="destructive">
                              删除
                            </Button>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </CardContent>
      </Card>
    </main>
  )
}
