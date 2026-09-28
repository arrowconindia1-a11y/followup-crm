"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { slugify, ACTIVE_WORKSPACE_COOKIE } from "@/lib/utils";

export default function OnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already has a workspace? Skip onboarding.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (Array.isArray(j.data) && j.data.length > 0) {
          router.replace("/dashboard");
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });
    const j = await res.json().catch(() => null);
    setLoading(false);

    if (!res.ok) {
      setError(j?.error?.message ?? "Could not create workspace.");
      return;
    }

    document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=${j.data.id}; path=/; max-age=31536000`;
    router.push("/dashboard");
    router.refresh();
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-xl text-white">
            ⚡
          </span>
          <div>
            <h1 className="text-lg font-semibold">Create your workspace</h1>
            <p className="text-sm text-gray-500">
              One workspace per business — you can add more later.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="wsName">
              Business / workspace name
            </label>
            <input
              id="wsName"
              type="text"
              required
              className="input"
              placeholder="Sharma Interiors"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="wsSlug">
              Workspace URL
            </label>
            <input
              id="wsSlug"
              type="text"
              required
              pattern="[a-z0-9][a-z0-9-]{1,39}"
              title="Lowercase letters, numbers and dashes only"
              className="input font-mono"
              placeholder="sharma-interiors"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
