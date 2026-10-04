import type { Metadata } from "next"
import { Rubik } from "next/font/google"
import "./globals.css"

const rubik = Rubik({
  variable: "--font-rubik",
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
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full antialiased`}>
      <body className="min-h-full bg-rose-50/40 text-slate-800">{children}</body>
    </html>
  )
}
