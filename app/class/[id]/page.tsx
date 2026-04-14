import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { AutoRefresh } from "@/components/auto-refresh"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getCurrentUser } from "@/lib/auth"
import {
  createPoll,
  createQuestion,
  getClassRoomData,
  submitQuestionAnswer,
  submitVote,
} from "@/lib/db"

type ClassRoomPageProps = {
  params: Promise<{ id: string }>
}

export default async function ClassRoomPage({ params }: ClassRoomPageProps) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/user/login")
  }

  const resolvedParams = await params
  const classId = Number(resolvedParams.id)

  if (!Number.isInteger(classId) || classId <= 0) {
    notFound()
  }

  const room = getClassRoomData(classId, user.id)
  if (!room) {
    notFound()
  }

  if (user.role !== "admin" && room.classSession.status !== "active") {
    redirect("/class")
  }

  const publishedItems = [
    ...room.polls.map((poll) => ({
      kind: "poll" as const,
      id: poll.id,
      title: poll.title,
      createdAt: poll.createdAt,
      item: poll,
    })),
    ...room.questions.map((question) => ({
      kind: "question" as const,
      id: question.id,
      title: question.title,
      createdAt: question.createdAt,
      item: question,
    })),
  ].sort((left, right) => right.createdAt - left.createdAt)

  const latestItem = publishedItems[0]

  async function createPollAction(formData: FormData) {
    "use server"

    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== "admin") {
      redirect(`/class/${classId}`)
    }

    const title = String(formData.get("title") || "").trim()
    const optionsRaw = String(formData.get("options") || "")
    const mode = String(formData.get("mode") || "single")
    const maxRaw = String(formData.get("maxSelections") || "").trim()

    const options = optionsRaw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)

    if (!title || options.length < 2) {
      redirect(`/class/${classId}`)
    }

    const allowMultiple = mode === "multi"
    let maxSelections: number | null = null

    if (allowMultiple && maxRaw) {
      const parsed = Number(maxRaw)
      if (Number.isInteger(parsed) && parsed > 0) {
        maxSelections = Math.min(parsed, options.length)
      }
    }

    createPoll({
      classId,
      title,
      allowMultiple,
      maxSelections,
      createdBy: currentUser.id,
      options,
    })

    revalidatePath(`/class/${classId}`)
    redirect(`/class/${classId}`)
  }

  function renderPublishedItem(
    entry: (typeof publishedItems)[number],
    options: { compact?: boolean } = {}
  ) {
    if (entry.kind === "poll") {
      const poll = entry.item

      return (
        <Card className={options.compact ? "space-y-2" : "shadow-sm"}>
          <CardHeader className={options.compact ? "space-y-1 p-4 text-center" : "space-y-1 text-center"}>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">投票</p>
            <CardTitle className={options.compact ? "text-base" : "text-2xl"}>{entry.title}</CardTitle>
            {!options.compact ? (
              <CardDescription>
                {poll.allowMultiple
                  ? `多选${poll.maxSelections ? `，最多 ${poll.maxSelections} 项` : "，不限数量"}`
                  : "单选"}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <form action={voteAction} className="space-y-2">
              <input type="hidden" name="pollId" value={poll.id} />
              <input type="hidden" name="isMultiple" value={poll.allowMultiple ? "1" : "0"} />

              <div className="grid gap-2">
                {poll.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card p-2 text-sm"
                  >
                    <span className="inline-flex items-center gap-2">
                      <input
                        type={poll.allowMultiple ? "checkbox" : "radio"}
                        name={poll.allowMultiple ? "optionIds" : "optionId"}
                        value={option.id}
                        disabled={poll.hasVoted}
                      />
                      {option.option_text}
                    </span>
                    <span className="text-xs text-muted-foreground">{option.vote_count} 票</span>
                  </label>
                ))}
              </div>

              <div className="text-center">
                <Button type="submit" size="sm" disabled={poll.hasVoted}>
                  {poll.hasVoted ? "已投票" : "提交投票"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )
    }

    const question = entry.item

    return (
      <Card className={options.compact ? "space-y-2" : "shadow-sm"}>
        <CardHeader className={options.compact ? "space-y-1 p-4 text-center" : "space-y-1 text-center"}>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">询问</p>
          <CardTitle className={options.compact ? "text-base" : "text-2xl"}>{entry.title}</CardTitle>
          {!options.compact ? (
            <CardDescription>请提交你的回答，页面会自动刷新结果。</CardDescription>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          <form action={answerAction} className="space-y-2">
            <input type="hidden" name="questionId" value={question.id} />
            <Input
              name="answerText"
              defaultValue={question.myAnswer ?? ""}
              required
              maxLength={500}
              placeholder="输入你的回答"
            />
            <div className="text-center">
              <Button type="submit" size="sm">
                {question.hasAnswered ? "更新回答" : "提交回答"}
              </Button>
            </div>
          </form>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
            <p className="font-medium">当前回答数：{question.answerCount}</p>
            <div className="mt-2 space-y-1">
              {question.answers.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无回答</p>
              ) : (
                question.answers.map((answer, index) => (
                  <p key={`${question.id}-${index}`} className="text-xs">
                    <span className="font-medium">{answer.username}：</span>
                    {answer.answer_text}
                  </p>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  async function createQuestionAction(formData: FormData) {
    "use server"

    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== "admin") {
      redirect(`/class/${classId}`)
    }

    const title = String(formData.get("title") || "").trim()
    if (!title) {
      redirect(`/class/${classId}`)
    }

    createQuestion({ classId, title, createdBy: currentUser.id })
    revalidatePath(`/class/${classId}`)
    redirect(`/class/${classId}`)
  }

  async function voteAction(formData: FormData) {
    "use server"

    const currentUser = await getCurrentUser()
    if (!currentUser) {
      redirect("/user/login")
    }

    const pollId = Number(formData.get("pollId") || 0)
    const isMultiple = String(formData.get("isMultiple") || "0") === "1"

    const optionIds = isMultiple
      ? formData
          .getAll("optionIds")
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [Number(formData.get("optionId") || 0)].filter(
          (value) => Number.isInteger(value) && value > 0
        )

    try {
      submitVote({ pollId, userId: currentUser.id, optionIds })
    } catch {
      // Keep current page flow simple; invalid submissions are ignored.
    }

    revalidatePath(`/class/${classId}`)
    redirect(`/class/${classId}`)
  }

  async function answerAction(formData: FormData) {
    "use server"

    const currentUser = await getCurrentUser()
    if (!currentUser) {
      redirect("/user/login")
    }

    const questionId = Number(formData.get("questionId") || 0)
    const answerText = String(formData.get("answerText") || "").trim()

    if (!answerText || answerText.length > 500) {
      redirect(`/class/${classId}`)
    }

    submitQuestionAnswer({ questionId, userId: currentUser.id, answerText })
    revalidatePath(`/class/${classId}`)
    redirect(`/class/${classId}`)
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-2xl">{room.classSession.title}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>会话ID: {room.classSession.id}</span>
              <Badge variant={room.classSession.status === "active" ? "default" : "secondary"}>
                {room.classSession.status === "active" ? "活跃" : "未激活"}
              </Badge>
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link href="/class">返回会话列表</Link>
          </Button>
        </CardHeader>
      </Card>

      {user.role === "admin" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">投票总数</p>
              <p className="text-xl font-semibold">{room.panel.totalPolls}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">问题总数</p>
              <p className="text-xl font-semibold">{room.panel.totalQuestions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">总投票条目</p>
              <p className="text-xl font-semibold">{room.panel.totalVotes}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">总回答数</p>
              <p className="text-xl font-semibold">{room.panel.totalAnswers}</p>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>发起投票</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createPollAction} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="poll-title">投票标题</Label>
                    <Input id="poll-title" name="title" required placeholder="投票标题" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="poll-options">选项</Label>
                    <Textarea
                      id="poll-options"
                      name="options"
                      required
                      rows={5}
                      placeholder="每行一个选项，例如：&#10;A&#10;B&#10;C"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="mode" value="single" defaultChecked />
                      单选
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="mode" value="multi" />
                      多选
                    </label>
                    <Input
                      name="maxSelections"
                      type="number"
                      min={1}
                      placeholder="多选上限（可不填）"
                      className="w-44"
                    />
                  </div>
                  <Button type="submit">创建投票</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>发起询问</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createQuestionAction} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="question-title">问题内容</Label>
                    <Input id="question-title" name="title" required placeholder="问题内容" />
                  </div>
                  <Button type="submit">创建问题</Button>
                </form>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>投票事件</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {room.polls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无投票</p>
                ) : (
                  room.polls.map((poll) => (
                    <article key={poll.id} className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{poll.title}</p>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/class/${classId}/event/poll/${poll.id}`}>详情</Link>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {poll.allowMultiple
                          ? `多选${poll.maxSelections ? `（最多 ${poll.maxSelections} 项）` : "（不限数量）"}`
                          : "单选"}
                      </p>
                      <div className="space-y-1">
                        {poll.options.map((option) => (
                          <div
                            key={option.id}
                            className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1 text-xs"
                          >
                            <span>{option.option_text}</span>
                            <span className="text-muted-foreground">{option.vote_count} 票</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>询问事件</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {room.questions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无问题</p>
                ) : (
                  room.questions.map((question) => (
                    <article key={question.id} className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{question.title}</p>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/class/${classId}/event/question/${question.id}`}>详情</Link>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">当前回答数：{question.answerCount}</p>
                    </article>
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <AutoRefresh intervalMs={2000}>
          <section className="space-y-6">
            {!latestItem ? (
              <Card className="flex min-h-[55vh] items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-2">
                  <h2 className="text-xl font-medium">还没有内容</h2>
                  <p className="text-sm text-muted-foreground">当前 class 还没有发布任何投票或询问。</p>
                </div>
              </Card>
            ) : (
              <>
                <Card className="flex min-h-[55vh] items-center justify-center p-4">
                  <div className="w-full max-w-3xl">{renderPublishedItem(latestItem)}</div>
                </Card>

                {publishedItems.length > 1 ? (
                  <details className="rounded-xl border border-border/60 bg-card p-4">
                    <summary className="cursor-pointer text-sm font-medium">查看其他已发布内容</summary>
                    <div className="mt-4 space-y-3">
                      {publishedItems.slice(1).map((item) => (
                        <Link
                          key={`${item.kind}-${item.id}`}
                          href={`/class/${classId}/event/${item.kind}/${item.id}`}
                          className="block rounded-lg border p-3 text-sm transition-colors hover:bg-muted/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">
                              {item.kind === "poll" ? "投票" : "询问"} · {item.title}
                            </p>
                            <span className="text-xs text-muted-foreground">查看详情</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </section>
        </AutoRefresh>
      )}
    </main>
  )
}
