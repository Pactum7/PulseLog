"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: form.get("password") }) });
    if (response.ok) { router.replace("/"); router.refresh(); } else setError((await response.json()).error || "登录失败");
    setLoading(false);
  }
  return <form onSubmit={submit} className="login-form"><label>访问密码<div className="input-with-icon"><LockKeyhole size={16}/><input name="password" type="password" autoFocus required placeholder="••••••••••••" /></div></label>{error && <p className="form-error">{error}</p>}<button className="primary wide" disabled={loading}>{loading ? "验证中…" : "进入工作台"}<ArrowRight size={16}/></button></form>;
}
