import { NextResponse, type NextRequest } from "next/server"
import { geocode } from "@/lib/geo"

// Public: the booking page turns the customer's address into coordinates
// before it asks for nearby slots. 404 = address not found, 502 = the map
// service is down (the page then shows all slots).
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? ""
  if (q.trim().length < 3) return NextResponse.json({ error: "bad_request" }, { status: 400 })
  try {
    const place = await geocode(q)
    if (!place) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(place, { headers: { "Cache-Control": "public, max-age=86400" } })
  } catch (e) {
    console.error("geocode failed", e)
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
