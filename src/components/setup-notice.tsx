export function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="card w-full max-w-lg p-8">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-xl text-white">
            ⚡
          </span>
          <div>
            <h1 className="text-lg font-semibold">FollowUp AI CRM</h1>
            <p className="text-sm text-gray-500">Phase 1 · zero-cost build</p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Supabase is not connected yet.</p>
          <p className="mt-1">
            Create <code className="rounded bg-amber-100 px-1">.env.local</code>{" "}
            in the project root with these two variables:
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li>NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key</li>
          </ul>
        </div>

        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-gray-600">
          <li>
            Create a free project at supabase.com and run the four files in{" "}
            <code className="rounded bg-gray-100 px-1">supabase/migrations/</code>{" "}
            in the SQL Editor.
          </li>
          <li>
            Copy the Project URL and anon key from Project Settings → API Keys.
          </li>
          <li>
            Save <code className="rounded bg-gray-100 px-1">.env.local</code>{" "}
            and restart <code className="rounded bg-gray-100 px-1">npm run dev</code>.
          </li>
        </ol>

        <p className="mt-4 text-sm text-gray-500">
          Full step-by-step instructions:{" "}
          <code className="rounded bg-gray-100 px-1">SETUP.md</code>
        </p>
      </div>
    </div>
  );
}
