import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { AutoRefresh } from "@/components/auto-refresh"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { getClassRoomData } from "@/lib/db"

type EventDetailPageProps = {
  params: Promise<{
    id: string
    kind: string
    eventId: string
  }>
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/user/login")
  }

  const resolvedParams = await params
  const classId = Number(resolvedParams.id)
  const eventId = Number(resolvedParams.eventId)
  const kind = resolvedParams.kind

  if (!Number.isInteger(classId) || classId <= 0 || !Number.isInteger(eventId) || eventId <= 0) {
    notFound()
  }

  if (kind !== "poll" && kind !== "question") {
    notFound()
  }

  const room = getClassRoomData(classId, user.id)
  if (!room) {
    notFound()
  }

  if (user.role !== "admin" && room.classSession.status !== "active") {
    redirect("/class")
  }

  const poll = kind === "poll" ? room.polls.find((item) => item.id === eventId) : null
  const question = kind === "question" ? room.questions.find((item) => item.id === eventId) : null

  if (!poll && !question) {
    notFound()
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-2xl">{room.classSession.title}</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span>会话ID: {room.classSession.id}</span>
              <Badge variant="outline">{kind === "poll" ? "投票详情" : "询问详情"}</Badge>
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link href={`/class/${classId}`}>返回当前 class</Link>
          </Button>
        </CardHeader>
      </Card>

      <AutoRefresh intervalMs={2000}>
        {poll ? (
          <Card>
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">投票详情</p>
              <CardTitle className="mt-2 text-2xl">{poll.title}</CardTitle>
              <CardDescription className="mt-2">
                {poll.allowMultiple
                  ? `多选${poll.maxSelections ? `（最多 ${poll.maxSelections} 项）` : "（不限数量）"}`
                  : "单选"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                {poll.options.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-3 text-sm"
                  >
                    <span>{option.option_text}</span>
                    <span className="text-muted-foreground">{option.vote_count} 票</span>
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">
                {poll.hasVoted ? "你已参与该投票" : "你尚未参与该投票"}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {question ? (
          <Card>
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">询问详情</p>
              <CardTitle className="mt-2 text-2xl">{question.title}</CardTitle>
              <CardDescription className="mt-2">当前回答数：{question.answerCount}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {question.myAnswer ? (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">我的回答</p>
                  <p className="mt-1">{question.myAnswer}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium">全部回答</p>
                {question.answers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无回答</p>
                ) : (
                  question.answers.map((answer, index) => (
                    <div
                      key={`${question.id}-${index}`}
                      className="rounded-lg border border-border/60 bg-card p-3 text-sm"
                    >
                      <p>
                        <span className="font-medium">{answer.username}：</span>
                        {answer.answer_text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </AutoRefresh>
    </main>
  )
}
