"use client"

import { useFormStatus } from "react-dom"
import { Loader2, Send } from "lucide-react"
import { authButton } from "@/components/AuthShell"

export function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button disabled={pending} className={authButton}>
      {pending ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
      {pending ? "שולח…" : "שליחת קישור כניסה"}
    </button>
  )
}
