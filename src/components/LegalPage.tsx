import Link from "next/link"
import { Heart } from "lucide-react"

export const LEGAL_CONTACT = "crm@nitzanet.co.il"
export const LEGAL_UPDATED = "11.10.2026"

// Shared frame for the public privacy policy and terms pages.
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#fdf8fa] px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-10">
        <Link href="/" className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-500">
            <Heart size={18} className="fill-white text-white" />
          </span>
          <span className="text-lg font-bold text-slate-900">Pulse CRM</span>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">עודכן לאחרונה: {LEGAL_UPDATED}</p>
        <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:ms-5 [&_ul]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
        <nav className="mt-10 flex gap-4 border-t border-slate-100 pt-5 text-sm text-slate-500">
          <Link href="/privacy" className="hover:text-rose-600">מדיניות פרטיות</Link>
          <Link href="/terms" className="hover:text-rose-600">תנאי שימוש</Link>
          <Link href="/login" className="hover:text-rose-600">כניסה למערכת</Link>
        </nav>
      </article>
    </main>
  )
}
