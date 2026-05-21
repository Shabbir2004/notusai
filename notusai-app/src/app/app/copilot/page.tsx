"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Namaste. I'm your NotusAI Copilot. Ask me about your clients, notices, anomalies, or anything GST-related.\n\nExamples:\n- *\"Show me all clients with ITC mismatch over ₹1L this quarter\"*\n- *\"Draft an advisory email about the new GSTR-3B Table 4 changes\"*\n- *\"What's the latest case law on Section 16(4) deadlines?\"*",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const res = await fetch("/api/copilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newMessages }),
    });

    if (!res.ok) {
      setMessages((m) => [...m, { role: "assistant", content: "❌ Something went wrong. Try again." }]);
      setLoading(false);
      return;
    }

    const { reply } = await res.json();
    setMessages((m) => [...m, { role: "assistant", content: reply }]);
    setLoading(false);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-ink-200 bg-white px-8 py-5">
        <h1 className="text-xl font-bold">Copilot</h1>
        <p className="text-sm text-ink-600">Ask anything about your practice. I have access to all client data.</p>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
                m.role === "user" ? "bg-ink-900 text-ink-50" : "border border-ink-200 bg-white text-ink-900"
              }`}>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{m.content}</pre>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-500">
                Thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-ink-200 bg-white px-8 py-4">
        <div className="mx-auto flex max-w-3xl gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask anything..."
            disabled={loading}
            className="flex-1 rounded-lg border border-ink-300 px-4 py-3 focus:border-ink-900 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-ink-900 px-6 py-3 font-semibold text-ink-50 hover:opacity-85 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
