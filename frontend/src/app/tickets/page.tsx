"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Ticket { id: string; title: string; status: string; priority: string; created_at: string; }

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    try { setTickets(await api("/tickets")); } catch {}
  };

  const createTicket = async () => {
    if (!title.trim() || loading) return;
    setLoading(true);
    try {
      await api("/tickets", { method: "POST", body: { title: title.trim(), priority } });
      setTitle(""); loadTickets();
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    await api(`/tickets/${id}`, { method: "PATCH", body: { status } });
    loadTickets();
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="h-12 border-b border-border flex items-center px-6 gap-4">
        <a href="/" className="text-sm text-text-secondary hover:text-text">← Home</a>
        <span className="text-sm font-medium text-text">Tickets</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex gap-2 mb-8">
          <input value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createTicket()}
            placeholder="Ticket title..." className="flex-1 h-10 bg-surface border border-border rounded-lg px-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent" />
          <select value={priority} onChange={e => setPriority(e.target.value)}
            className="h-10 bg-surface border border-border rounded-lg px-3 text-sm text-text focus:outline-none focus:border-accent">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button onClick={createTicket} disabled={loading || !title.trim()}
            className="h-10 px-5 bg-text text-bg rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-25">Create</button>
        </div>

        <div className="space-y-1">
          {tickets.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-surface transition-colors">
              <span className={`w-2 h-2 rounded-full ${t.status === "open" ? "bg-warning" : t.status === "in_progress" ? "bg-accent" : "bg-success"}`} />
              <span className="text-sm text-text flex-1">{t.title}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${t.priority === "high" ? "bg-error/10 text-error" : t.priority === "low" ? "bg-text-muted/10 text-text-muted" : "bg-warning/10 text-warning"}`}>{t.priority}</span>
              <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-secondary focus:outline-none">
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          ))}
          {tickets.length === 0 && <p className="text-sm text-text-muted text-center py-12">No tickets yet</p>}
        </div>
      </main>
    </div>
  );
}
