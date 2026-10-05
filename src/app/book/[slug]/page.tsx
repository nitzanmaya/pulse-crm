import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { BookableService } from "@/lib/booking/shared"
import BookingFlow from "@/components/booking/BookingFlow"

type BookingPage = { org: { name: string; slug: string; headline: string | null; max_days: number }; services: BookableService[] }

async function load(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("get_booking_page", { _slug: slug })
  return data as unknown as BookingPage | null
}

export async function generateMetadata({ params }: PageProps<"/book/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const page = await load(slug)
  return { title: page ? `קביעת תור · ${page.org.name}` : "קביעת תור" }
}

export default async function BookPage({ params }: PageProps<"/book/[slug]">) {
  const { slug } = await params
  const page = await load(slug)
  if (!page) notFound()
  return <BookingFlow org={page.org} services={page.services.map((s) => ({ ...s, price: Number(s.price) }))} />
}
