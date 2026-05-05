import reasons from '@/lib/no-reasons.json'

export async function GET() {
  const reason = reasons[Math.floor(Math.random() * reasons.length)]
  return Response.json({ reason })
}
