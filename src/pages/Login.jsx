import { useState } from "react";
import { TextField, Checkbox } from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import { BRAND } from "../constants/Brand.js";
import { useNavigate } from "react-router-dom";
import { supabase } from "../createClient";
import { useAuth } from "../context/AuthContext";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { setUser, fetchRole } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Enter both your email and password.");
      return;
    }

    setSubmitting(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Incorrect email or password. Please try again.");
      setSubmitting(false);
      return;
    }

    setUser(data.user);
    await fetchRole(data.user.id);
    setSubmitting(false);
    navigate("/dashboard");
    console.log("User signed in:", data.user);
  }

  return (
    <div className="min-h-screen bg-backgroundAlt flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-background px-8 py-10 sm:px-10 sm:py-12 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(124,31,162,0.18)]">
          <div className="flex items-center gap-3 mb-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg text-white">
              {BRAND.name.charAt(0)}
            </span>
            <div>
              <h1 className="font-display text-lg text-secondary leading-tight">
                {BRAND.name}
              </h1>
              <p className="text-sm text-muted">Welcome back</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-md bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={submitting}
            />

            <TextField
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
            />

            <div className="flex items-center justify-between pt-1">
              <Checkbox label="Keep me signed in" disabled={submitting} />
              <a
                href="#"
                className="text-sm text-primary hover:text-primaryDark focus:outline-none focus:underline"
              >
                Forgot password?
              </a>
            </div>

            <Button type="submit" className="w-full mt-2" loading={submitting} disabled={submitting}>
              {submitting ? "Signing in" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Having trouble signing in?{" "}
          <a href="#" className="text-primary hover:text-primaryDark focus:outline-none focus:underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}