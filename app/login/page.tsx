import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");
  return <main className="login-shell"><section className="login-card"><div className="brand-mark">P</div><p className="eyebrow">ELASTICSEARCH LOG EXPLORER</p><h1>回到日志现场</h1><p className="muted">用部署时配置的访问密码进入 PulseLog。</p><LoginForm /></section></main>;
}
