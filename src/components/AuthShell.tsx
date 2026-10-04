import { Heart } from "lucide-react"

// Shared frame for the login, onboarding and invite screens.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fdf8fa] p-4">
      <div aria-hidden className="pointer-events-none absolute -end-32 -top-32 h-96 w-96 rounded-full bg-rose-300/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -start-32 h-[28rem] w-[28rem] rounded-full bg-violet-300/25 blur-3xl" />
      <div className="relative w-full max-w-md animate-pop-in">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 shadow-lg shadow-rose-500/30">
            <Heart size={24} className="animate-heartbeat fill-white text-white" />
          </span>
          <span className="text-2xl font-bold tracking-tight text-slate-900">Pulse CRM</span>
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-2xl shadow-slate-900/10 backdrop-blur">{children}</div>
        <p className="mt-6 text-center text-sm text-slate-400">ניצנט · crm.nitzanet.co.il</p>
      </div>
    </main>
  )
}

export const authInput =
  "w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-800 placeholder:text-slate-400 shadow-sm transition focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-100"

export const authButton =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-rose-500 to-pink-500 text-base font-bold text-white shadow-lg shadow-rose-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-rose-500/35 active:translate-y-0 active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
