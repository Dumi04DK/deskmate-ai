"use client";

import { useId, useState } from "react";
import { ArrowRight, Building2, Mail, User } from "lucide-react";
import LogoMark from "./LogoMark";

const FIELD_CLASS =
  "w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15";

// A lightweight, local-only sign-in: it personalizes the workspace with
// a name (and optionally email/company), nothing more. There is no
// password, no server-side account, and no way to verify identity — the
// details are stored in this browser's localStorage only. This is
// intentional: the app has no database (see README), so real
// authentication isn't in scope yet. Framing it honestly here avoids
// implying a security boundary that doesn't exist.
export default function SignIn({ onComplete }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const uid = useId();

  const submit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onComplete({ name: trimmed, email: email.trim(), company: company.trim() });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark size={56} />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-stone-900">Create your workspace</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            A few details to personalize Deskmate AI — no password required.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label htmlFor={`${uid}-name`} className="mb-1.5 block text-sm font-medium text-stone-700">
                Full name
              </label>
              <div className="relative">
                <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  id={`${uid}-name`}
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Chen"
                  maxLength={80}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
            <div>
              <label htmlFor={`${uid}-email`} className="mb-1.5 block text-sm font-medium text-stone-700">
                Work email <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <div className="relative">
                <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  id={`${uid}-email`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  maxLength={200}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
            <div>
              <label htmlFor={`${uid}-company`} className="mb-1.5 block text-sm font-medium text-stone-700">
                Company <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <div className="relative">
                <Building2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  id={`${uid}-company`}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc."
                  maxLength={120}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            Create workspace <ArrowRight size={15} />
          </button>
          <p className="mt-4 text-center text-xs leading-relaxed text-stone-400">
            Nothing here is verified or sent to a server — these details stay in this browser
            and only personalize what you see.
          </p>
        </form>
      </div>
    </div>
  );
}
