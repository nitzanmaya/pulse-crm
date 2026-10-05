"use client";

import React, { useState, useEffect } from "react";
import { X, Crown } from "lucide-react";

/* Shared UI primitives for the Pulse CRM dashboard and its modules. */

export const AVATAR_COLORS = ["from-sky-400 to-indigo-500", "from-emerald-400 to-teal-500", "from-amber-400 to-orange-500", "from-fuchsia-400 to-violet-500", "from-rose-400 to-pink-500"];
export const initials = (name) => name.split(" ").map((p) => p[0]).slice(0, 2).join("");

export const Card = ({ className = "", children, ...rest }) => (
  <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.14)] ${className}`} {...rest}>{children}</div>
);

export const Avatar = ({ member, size = "h-8 w-8 text-xs" }) => (
  <span title={member?.name} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${AVATAR_COLORS[(member?.color ?? 0) % AVATAR_COLORS.length]} ${size} font-semibold text-white shadow-sm ring-2 ring-white`}>
    {member ? initials(member.name) : "?"}
  </span>
);

// Icons inside buttons get a small playful nudge on hover.
export const ICON_NUDGE = "[&_svg]:transition-transform [&_svg]:duration-200 [&:hover_svg]:scale-110 [&:hover_svg]:-rotate-6";

export const Btn = ({ variant = "primary", size = "md", className = "", children, onPointerDown, ...rest }) => {
  const [ripples, setRipples] = useState([]);
  const addRipple = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = Date.now() + Math.random();
    setRipples((all) => [...all, { id, x: e.clientX - r.left, y: e.clientY - r.top, d: Math.max(r.width, r.height) * 2.2 }]);
    setTimeout(() => setRipples((all) => all.filter((x) => x.id !== id)), 650);
    onPointerDown?.(e);
  };
  const v = {
    primary: "bg-gradient-to-l from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/25 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-rose-500/35",
    ghost: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:-translate-y-0.5 hover:border-rose-200 hover:text-rose-600 hover:shadow-md",
    danger: "border border-red-200 bg-red-50 text-red-600 hover:-translate-y-0.5 hover:bg-red-100",
  }[variant];
  const s = { md: "h-11 px-5 text-[15px]", lg: "h-12 px-6 text-base" }[size];
  return (
    <button onPointerDown={addRipple} className={`relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl font-semibold transition-all duration-200 active:translate-y-0 active:scale-[0.97] focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 disabled:pointer-events-none disabled:opacity-45 ${ICON_NUDGE} ${s} ${v} ${className}`} {...rest}>
      {ripples.map((r) => (
        <span key={r.id} aria-hidden className={`pointer-events-none absolute -z-10 animate-ripple rounded-full ${variant === "primary" ? "bg-white" : "bg-rose-400"}`} style={{ left: r.x, top: r.y, width: r.d, height: r.d }} />
      ))}
      {children}
    </button>
  );
};

export const Field = ({ label, children }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-sm font-medium text-slate-600">{label}</span>
    {children}
  </label>
);
export const inputCls = "w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[15px] text-slate-800 placeholder:text-slate-400 shadow-sm transition focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-100";

export const RoleBadge = ({ role }) => {
  const s = {
    Owner: "bg-amber-50 text-amber-700 border-amber-200",
    Admin: "bg-violet-50 text-violet-700 border-violet-200",
    Agent: "bg-sky-50 text-sky-700 border-sky-200",
    Viewer: "bg-slate-100 text-slate-600 border-slate-200",
  }[role];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s}`}>{role === "Owner" && <Crown size={12} />}{role}</span>;
};

export const SectionTitle = ({ icon: Icon, color = "text-rose-500", children, action }) => (
  <div className="flex items-center justify-between gap-2">
    <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">{Icon && <Icon size={18} className={color} />}{children}</h3>
    {action}
  </div>
);

export const Modal = ({ open, onClose, title, children, wide }) => {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] animate-pop-in overflow-y-auto rounded-3xl bg-white shadow-2xl shadow-slate-900/20`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="סגירה" className="rounded-full p-2 text-slate-400 transition hover:rotate-90 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export function Toggle({ checked, onChange, disabled, icon: Icon, title, text }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-start transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${checked ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${checked ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-400"}`}><Icon size={19} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-slate-800">{title}</span>
        <span className="block text-sm text-slate-500">{text}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${checked ? "bg-gradient-to-l from-rose-500 to-pink-500" : "bg-slate-300"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ${checked ? "start-6" : "start-1"}`} />
      </span>
    </button>
  );
}
