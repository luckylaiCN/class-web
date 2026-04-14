import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createUserSession, getCurrentUser, registerUser } from "@/lib/auth"

type RegisterPageProps = {
  searchParams?: Promise<{ error?: string }>
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const user = await getCurrentUser()
  if (user) {
    redirect("/class")
  }

  const params = searchParams ? await searchParams : undefined
  const error = params?.error

  async function registerAction(formData: FormData) {
    "use server"

    const username = String(formData.get("username") || "")
    const password = String(formData.get("password") || "")

    try {
      const safeUser = registerUser(username, password)
      await createUserSession(safeUser.id)
      redirect("/class")
    } catch (err) {
      const message = err instanceof Error ? err.message : "注册失败"
      redirect(`/user/register?error=${encodeURIComponent(message)}`)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center p-6">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>注册</CardTitle>
          <CardDescription>创建账户后即可参与课堂互动。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">{error}</p> : null}

          <form action={registerAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input id="username" name="username" required minLength={3} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>

            <Button type="submit" className="w-full">
              注册
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            已有账号？
            <Link href="/user/login" className="ml-1 underline">
              去登录
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
