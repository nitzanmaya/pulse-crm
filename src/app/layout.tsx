import type { Metadata } from "next"
import { Assistant } from "next/font/google"
import "./globals.css"

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
})

export const metadata: Metadata = {
  title: "Pulse CRM",
  description: "מערכת CRM רב-ארגונית של ניצנט",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.nitzanet.co.il"),
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  )
}
