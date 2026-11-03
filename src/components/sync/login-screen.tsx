"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { getSupabase } from "@/lib/sync/client";

const ERRORS: Record<string, string> = {
  "Invalid login credentials": "Неверная почта или пароль",
  "Email not confirmed": "Почта не подтверждена — открой письмо от Supabase и перейди по ссылке",
  "User already registered": "Такой аккаунт уже есть — войди",
  "Failed to fetch": "Нет связи с сервером. Проверь интернет и попробуй ещё раз",
  "Signups not allowed for this instance": "Регистрация новых аккаунтов отключена",
};

export function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    if (password.length < 6) return toast.error("Пароль — минимум 6 символов");
    setBusy(true);
    const { data, error } = await (mode === "signin" ? sb.auth.signInWithPassword({ email, password }) : sb.auth.signUp({ email, password })).catch(
      (e: Error) => ({ data: { session: null }, error: e }),
    );
    setBusy(false);
    if (error) return toast.error(ERRORS[error.message] ?? error.message);
    if (mode === "signup" && !data.session) {
      toast.success("Аккаунт создан. Подтверди почту по ссылке из письма и войди", { duration: 10_000 });
      setMode("signin");
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-2xl text-primary-foreground">₸</span>
          <h1 className="text-xl font-bold">Деньги</h1>
          <p className="text-sm text-muted-foreground">Один аккаунт на семью — данные одинаковые на компьютере и планшете</p>
        </div>
        <Segmented
          className="mb-4"
          value={mode}
          onChange={setMode}
          options={[
            { value: "signin", label: "Вход" },
            { value: "signup", label: "Новый аккаунт" },
          ]}
        />
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Почта">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Пароль">
            <Input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Секунду…" : mode === "signin" ? "Войти" : "Создать аккаунт"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
