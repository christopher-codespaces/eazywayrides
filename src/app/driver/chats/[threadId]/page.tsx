"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  orderBy,
  query,
  onSnapshot,
  updateDoc,
  limit,
} from "firebase/firestore";
import { app } from "@/lib/firebase";

type Message = {
  id: string;
  text: string;
  senderId: string;
  senderRole: "business" | "driver";
  createdAt?: Date | null;
};

const formatDateTime = (d?: Date | null) => {
  if (!d) return "—";
  return d.toLocaleString();
};

export default function DriverChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();

  const db = useMemo(() => (app ? getFirestore(app) : null), []);
  const auth = useMemo(() => (app ? getAuth(app) : null), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [thread, setThread] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Scroll behavior
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  // Auto-scroll to bottom when new messages arrive (only if user is already near bottom)
  useEffect(() => {
    if (!stickToBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stickToBottom]);

  useEffect(() => {
    if (!threadId) return;

    let unsubMsgs: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      // If auth changes and we already had a messages listener, kill it first
      if (unsubMsgs) {
        unsubMsgs();
        unsubMsgs = null;
      }

      if (!user) {
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const threadRef = doc(db, "threads", threadId);
        const threadSnap = await getDoc(threadRef);

        if (!threadSnap.exists()) throw new Error("Chat thread not found.");

        const t = threadSnap.data() as any;

        if (t.driverId !== user.uid) {
          throw new Error("You do not have access to this chat.");
        }

        setThread({ id: threadSnap.id, ...t });

        const msgsRef = collection(db, "threads", threadId, "messages");

        // Load only the most recent messages to avoid huge reads over time.
        // We order by createdAt DESC and reverse in UI to show oldest -> newest.
        const q = query(msgsRef, orderBy("createdAt", "desc"), limit(50));

        unsubMsgs = onSnapshot(
          q,
          (snap) => {
            const list: Message[] = snap.docs.map((d) => {
              const data = d.data() as any;
              return {
                id: d.id,
                text: data.text,
                senderId: data.senderId,
                senderRole: data.senderRole,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
              };
            });

            // Reverse so the UI is chronological (oldest -> newest)
            setMessages(list.reverse());
            setLoading(false);
          },
          (err) => {
            console.error(err);

            if (err?.code === "permission-denied") {
              setError("Session changed. Please refresh the page.");
            } else {
              setError(err.message || "Failed to load messages.");
            }
            setLoading(false);
          }
        );
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to load chat.");
        setLoading(false);
      }
    });

    // Proper React cleanup
    return () => {
      if (unsubMsgs) unsubMsgs();
      unsubAuth();
    };
  }, [auth, db, router, threadId]);

  const sendMessage = async () => {
    setError(null);

    const user = auth.currentUser;
    if (!user) {
      setError("You must be logged in.");
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      const msgsRef = collection(db, "threads", threadId, "messages");

      await addDoc(msgsRef, {
        text: trimmed,
        senderId: user.uid,
        senderRole: "driver",
        createdAt: serverTimestamp(),
      });

      const threadRef = doc(db, "threads", threadId);
      await updateDoc(threadRef, {
        lastMessageText: trimmed,
        lastMessageAt: serverTimestamp(),
      });

      setText("");
      // after sending, you generally want to stick to bottom
      setStickToBottom(true);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Chat</h1>
          <p className="text-sm text-gray-600">
            {thread ? `Job: ${thread.jobId}` : ""}
          </p>
        </div>

        <button
          onClick={() => router.push("/driver/chats")}
          className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
        >
          Back to Chats
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading chat...</p>}
      {error && !loading && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          {/* Scrollable messages window */}
          <div
            ref={scrollerRef}
            className="bg-white border rounded-lg shadow p-4 space-y-3 h-[65vh] overflow-y-auto"
            onScroll={() => {
              const el = scrollerRef.current;
              if (!el) return;
              const distanceFromBottom =
                el.scrollHeight - el.scrollTop - el.clientHeight;
              setStickToBottom(distanceFromBottom < 120);
            }}
          >
            {messages.length === 0 && (
              <p className="text-sm text-gray-600">No messages yet.</p>
            )}

            {messages.map((m) => {
              const mine = m.senderRole === "driver";
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 border ${
                      mine ? "bg-blue-50" : "bg-gray-50"
                    }`}
                  >
                    <p className="text-sm text-gray-800">{m.text}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {m.senderRole.toUpperCase()} • {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* anchor for auto-scroll */}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="flex gap-2">
            <input
              className="flex-1 p-3 border rounded-lg"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !text.trim()}
              className="px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>

          {/* Optional hint if user scrolled up */}
          {!stickToBottom && messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setStickToBottom(true);
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-sm text-blue-600 hover:underline self-start"
            >
              Jump to latest
            </button>
          )}
        </>
      )}
    </div>
  );
}
