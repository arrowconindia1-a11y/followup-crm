"use client";

import { useCallback, useEffect, useState } from "react";
import { cn, dueLabel, formatDateTime, toLocalInputValue } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types";

const PRIORITY_CLASS: Record<Task["priority"], string> = {
  urgent: "bg-rose-100 text-rose-700",
  high: "bg-amber-100 text-amber-700",
  medium: "bg-sky-100 text-sky-700",
  low: "bg-gray-100 text-gray-500",
};

export function TasksBoard({ workspaceId }: { workspaceId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?workspace_id=${workspaceId}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error?.message ?? "Failed to load tasks");
      setTasks(j.data as Task[]);
      setMessage(null);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(task: Task, status: TaskStatus) {
    const previous = tasks;
    setTasks(
      tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status,
              completed_at:
                status === "completed" ? new Date().toISOString() : null,
            }
          : t
      )
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "Update failed");
      }
    } catch (e) {
      setTasks(previous);
      setMessage((e as Error).message);
    }
  }

  async function remove(task: Task) {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setMessage(j?.error?.message ?? "Delete failed");
      return;
    }
    void load();
  }

  const open = tasks.filter((t) => t.status === "pending" || t.status === "snoozed");
  const done = tasks.filter((t) => t.status === "completed");

  const groups = [
    { label: "Overdue", tone: "text-rose-600", items: open.filter((t) => t.due_at && new Date(t.due_at) < new Date()) },
    { label: "Today", tone: "text-amber-600", items: open.filter((t) => t.due_at && new Date(t.due_at).toDateString() === new Date().toDateString() && new Date(t.due_at) >= new Date()) },
    { label: "Upcoming", tone: "text-gray-700", items: open.filter((t) => t.due_at && new Date(t.due_at) > new Date() && new Date(t.due_at).toDateString() !== new Date().toDateString()) },
    { label: "No due date", tone: "text-gray-500", items: open.filter((t) => !t.due_at) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          + New task
        </button>
        {message && <p className="text-sm text-amber-700">{message}</p>}
      </div>

      {showForm && <NewTaskForm workspaceId={workspaceId} onCreated={() => { setShowForm(false); void load(); }} />}

      {loading && tasks.length === 0 ? (
        <p className="text-sm text-gray-400">Loading tasks…</p>
      ) : open.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-gray-500">
          No open tasks. Ask the{" "}
          <a href="/assistant" className="font-medium text-brand-600 hover:underline">
            Assistant
          </a>{" "}
          — e.g. “follow up with Rahul tomorrow 5pm”.
        </div>
      ) : null}

      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <section key={group.label}>
              <h2 className={cn("mb-2 text-sm font-semibold", group.tone)}>
                {group.label} ({group.items.length})
              </h2>
              <ul className="card divide-y divide-gray-100">
                {group.items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => setStatus(task, "completed")}
                    onDelete={() => remove(task)}
                  />
                ))}
              </ul>
            </section>
          )
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-400">
            Completed ({done.length})
          </h2>
          <ul className="card divide-y divide-gray-100 opacity-60">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => setStatus(task, "pending")}
                onDelete={() => remove(task)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const due = dueLabel(task.due_at);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <input
        type="checkbox"
        checked={task.status === "completed"}
        onChange={onToggle}
        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
        aria-label={`Toggle ${task.title}`}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium text-gray-800",
            task.status === "completed" && "text-gray-400 line-through"
          )}
        >
          {task.title}
        </p>
        <p className="text-xs text-gray-400">
          {task.leads?.name ?? "No lead linked"}
          {task.description ? ` · ${task.description}` : ""}
        </p>
      </div>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium",
          PRIORITY_CLASS[task.priority]
        )}
      >
        {task.priority}
      </span>
      <span
        className={cn(
          "hidden w-32 text-right text-xs sm:block",
          due.tone === "overdue" ? "font-medium text-rose-600" : "text-gray-500"
        )}
        title={task.due_at ? formatDateTime(task.due_at) : undefined}
      >
        {due.text}
      </span>
      <button onClick={onDelete} className="text-xs text-gray-300 hover:text-rose-500" aria-label="Delete task">
        ✕
      </button>
    </li>
  );
}

function NewTaskForm({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        title,
        priority,
        due_at: due ? new Date(due).toISOString() : "",
      }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(j?.error?.message ?? "Could not create task");
      return;
    }
    setTitle("");
    setDue("");
    onCreated();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          className="input"
          required
          placeholder="Task title — e.g. Send quote for kitchen interior"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="datetime-local"
          className="input w-auto"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date"
        />
        <select
          className="input w-auto"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Task["priority"])}
          aria-label="Priority"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary btn-sm">
          {saving ? "Adding…" : "Add task"}
        </button>
        <span className="self-center text-xs text-gray-400">
          (default value {toLocalInputValue("") === "" ? "no due date" : ""})
        </span>
      </div>
    </form>
  );
}
