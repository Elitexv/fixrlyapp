import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { useSession } from "@/lib/session";
import { fetchConversationMessages, fetchConversationsForUser, sendChatMessage } from "@/lib/chat";
import { ArrowLeft, Loader2, Send, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Messages — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      return fetchConversationsForUser(user.id);
    },
  });

  const selectedConversation = useMemo(() => conversations.find((c: any) => c.id === selectedConversationId) ?? null, [conversations, selectedConversationId]);
  const isProviderSide = !!(selectedConversation && user && selectedConversation.provider_id === user.id);

  useEffect(() => {
    if (!conversations.length) return;
    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem("selectedConversationId") : null;
    const fallback = conversations.find((c: any) => c.id === stored)?.id ?? conversations[0].id;
    if (!selectedConversationId || !conversations.some((c: any) => c.id === selectedConversationId)) {
      setSelectedConversationId(fallback);
    }
  }, [conversations, selectedConversationId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["chat-messages", selectedConversationId],
    enabled: !!selectedConversationId,
    queryFn: async () => {
      if (!selectedConversationId) return [];
      return fetchConversationMessages(selectedConversationId);
    },
  });

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const channel = supabase
      .channel(`chat:${selectedConversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${selectedConversationId}` }, (payload) => {
        const incoming = payload.new as any;
        qc.setQueryData(["chat-messages", selectedConversationId], (old: any[] = []) => {
          const withoutOptimisticDupe = old.filter(
            (m) => !(m._optimistic && m.sender_id === incoming.sender_id && m.content === incoming.content),
          );
          if (withoutOptimisticDupe.some((m) => m.id === incoming.id)) return withoutOptimisticDupe;
          return [...withoutOptimisticDupe, incoming];
        });
        qc.invalidateQueries({ queryKey: ["conversations", user?.id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId, qc, user?.id]);

  const send = async () => {
    if (!user || !selectedConversation || !draft.trim()) return;
    const content = draft.trim();
    const senderRole = isProviderSide ? "provider" : "user";
    const tempId = `temp-${Date.now()}`;
    setDraft("");
    qc.setQueryData(["chat-messages", selectedConversation.id], (old: any[] = []) => [
      ...old,
      { id: tempId, conversation_id: selectedConversation.id, sender_id: user.id, sender_role: senderRole, content, created_at: new Date().toISOString(), is_read: false, _optimistic: true },
    ]);
    setSending(true);
    try {
      await sendChatMessage(selectedConversation.id, user.id, senderRole, content);
      qc.invalidateQueries({ queryKey: ["conversations", user.id] });
    } catch (err: any) {
      qc.setQueryData(["chat-messages", selectedConversation.id], (old: any[] = []) => old.filter((m) => m.id !== tempId));
      setDraft(content);
      toast.error(err.message ?? "Could not send message");
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return <div className="min-h-screen grid place-items-center px-4 text-center text-sm text-brand/60">Please sign in to chat with providers.</div>;
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <header className="shrink-0 border-b border-brand/5 bg-surface px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-brand/40">Messages</div>
            <h1 className="text-xl font-black">Provider chat</h1>
          </div>
          <Link to="/" className="text-sm font-bold text-accent">Home</Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col gap-3 overflow-hidden px-4 py-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:flex-row">
        <aside className={`${mobileShowChat ? "hidden lg:flex" : "flex"} w-full flex-col overflow-y-auto rounded-3xl border border-brand/5 bg-surface p-3 lg:w-80`}>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand/40">Conversations</div>
          {isLoading ? (
            <div className="grid place-items-center py-8"><Loader2 className="size-5 animate-spin text-brand/40" /></div>
          ) : conversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand/10 p-4 text-sm text-brand/60">No conversations yet. Start from a provider profile to begin chatting.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {conversations.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedConversationId(c.id);
                    setMobileShowChat(true);
                  }}
                  className={`w-full rounded-2xl border p-3 text-left ${selectedConversation?.id === c.id ? "border-accent bg-accent/5" : "light-surface border-brand/10 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold truncate">
                      {c.provider_id === user.id ? (c.customer_name ?? "Customer") : (c.provider_name ?? "Provider")}
                    </div>
                    <div className="text-[10px] text-brand/40">{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "New"}</div>
                  </div>
                  <div className="mt-1 text-xs text-brand/60 line-clamp-2">{c.last_message_preview || "Start the conversation"}</div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className={`${mobileShowChat ? "flex" : "hidden lg:flex"} min-h-0 flex-1 flex-col rounded-3xl border border-brand/5 bg-surface p-3`}>
          {selectedConversation ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-brand/5 pb-3">
                <button onClick={() => setMobileShowChat(false)} className="rounded-xl p-1.5 text-brand/60 hover:bg-brand/5 lg:hidden">
                  <ArrowLeft className="size-5" />
                </button>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand/40">Conversation</div>
                  <div className="font-semibold">
                    {selectedConversation.provider_id === user.id
                      ? (selectedConversation.customer_name ?? "Customer")
                      : (selectedConversation.provider_name ?? "Provider")}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex-1 min-h-0 space-y-2 overflow-y-auto rounded-2xl bg-canvas p-3">
                {messagesLoading && messages.length === 0 ? (
                  <div className="grid place-items-center py-8"><Loader2 className="size-5 animate-spin text-brand/40" /></div>
                ) : messages.length === 0 ? (
                  <div className="grid place-items-center py-8 text-sm text-brand/60">No messages yet. Say hello to the provider.</div>
                ) : (
                  messages.map((m: any) => (
                    <div key={m.id} className={`flex ${m.sender_id === user.id ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender_id === user.id ? "bg-accent text-white" : "light-surface bg-white border border-brand/10 text-brand"} ${m._optimistic ? "opacity-70" : ""}`}>
                        {m.content}
                        <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={scrollBottomRef} />
              </div>

              <div className="mt-3 flex shrink-0 gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="light-surface flex-1 rounded-2xl border border-brand/10 bg-white px-3 py-2.5 text-sm outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button onClick={send} disabled={sending || !draft.trim()} className="rounded-2xl bg-accent px-3 py-2.5 text-white disabled:opacity-60">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </div>
            </>
          ) : (
            <div className="grid place-items-center py-16 text-sm text-brand/60">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-3 size-8 text-brand/20" />
                Select a conversation to start messaging.
              </div>
            </div>
          )}
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
