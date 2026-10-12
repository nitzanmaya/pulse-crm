// Address -> coordinates with OpenStreetMap's Nominatim (free, no key).
// Its usage policy asks for an identifying User-Agent and at most one request
// per second, so lookups are cached and spaced out per server instance.

export type Place = { lat: number; lng: number; label: string }

const UA = "PulseCRM/1.0 (crm.nitzanet@gmail.com)"
const cache = new Map<string, Place | null>()
let last = 0

const key = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase()

// Full address first; if the street isn't on the map, the city alone is close
// enough for a distance check in kilometres
export async function geocode(address: string): Promise<Place | null> {
  const full = await lookup(address)
  if (full) return full
  const city = address.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
  return city.length > 1 ? lookup(city.at(-1)!) : null
}

async function lookup(address: string): Promise<Place | null> {
  const q = address.trim().replace(/\s+/g, " ").slice(0, 200)
  if (q.length < 3) return null
  const k = key(q)
  if (cache.has(k)) return cache.get(k)!

  const wait = last + 1100 - Date.now()
  last = Math.max(Date.now(), last + 1100)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))

  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.search = new URLSearchParams({ q, countrycodes: "il", format: "jsonv2", limit: "1", "accept-language": "he" }).toString()
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://crm.nitzanet.co.il" }, signal: AbortSignal.timeout(6000) })
  if (!res.ok) throw new Error(`geocode ${res.status}`)
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[]
  const place = hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name } : null
  if (cache.size > 2000) cache.clear()
  cache.set(k, place)
  return place
}
