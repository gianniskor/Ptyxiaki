"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Scale, FileText, Loader2, Sparkles, Bot, User, ChevronDown } from "lucide-react";
import { AuthButton } from "@/components/AuthButton";
import { AdminNavLink } from "@/components/AdminNavLink";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { AIInputWithLoading } from "@/components/ui/ai-input-with-loading";
import { Loader } from "@/components/ui/animated-loading-svg-text-shimmer";
import { PdfViewer } from "@/components/PdfViewer";
import { getFileTypeStyle } from "@/components/FileTypeIcon";
import { buildPdfUrl } from "@/lib/api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface RagSource {
  id?: string;
  title?: string;
  arithmos?: string;
  snippet?: string;
  pdfPath?: string;
  searchTerms?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  sources?: RagSource[];
}

// Χωρίζει το reasoning
function parseThink(text: string): { reasoning: string; content: string } {
  const start = text.indexOf("<think>");
  if (start === -1) return { reasoning: "", content: text };

  const end = text.indexOf("</think>");
  if (end === -1) {
    // Ακόμα σκέφτεται — δεν υπάρχει ορατό content ακόμα
    return {
      reasoning: text.slice(start + 7).trim(),
      content: text.slice(0, start).trim(),
    };
  }

  const reasoning = text.slice(start + 7, end).trim();
  const content = (text.slice(0, start) + text.slice(end + 8)).trim();
  return { reasoning, content };
}

// Συλλέγει τα citation IDs που υπάρχουν σε ένα assistant μήνυμα.
const BOLD_OR_CITE_RE = /\*\*([^*]+?)\*\*|\[(\d+)\]/g;

// Citation badge: clickable + tooltip με το highlighted κείμενο της πηγής.
// Το tooltip γίνεται render σε portal με fixed θέση, clamped στο viewport,
// ώστε να μην κόβεται από το overflow του chat container ή τα όρια της οθόνης.
function CitationBadge({
  n,
  source,
  onClick,
}: {
  n: string;
  source?: RagSource;
  onClick: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState<{ left: number; top: number; placement: "top" | "bottom" } | null>(
    null,
  );

  const TIP_WIDTH = 288; // w-72
  const MARGIN = 8;

  const showTip = () => {
    if (!source) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;

    const vw = window.innerWidth;
    const center = rect.left + rect.width / 2;
    const left = Math.min(
      Math.max(center - TIP_WIDTH / 2, MARGIN),
      vw - TIP_WIDTH - MARGIN,
    );

    // Προτίμηση πάνω από το badge· αν δεν χωράει, βάλ' το από κάτω.
    const placement: "top" | "bottom" = rect.top > 200 ? "top" : "bottom";
    const top = placement === "top" ? rect.top - MARGIN : rect.bottom + MARGIN;

    setTip({ left, top, placement });
  };

  const hideTip = () => setTip(null);

  return (
    <span className="relative inline-block align-baseline">
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
        className="mx-0.5 inline-flex items-center justify-center rounded bg-yellow-500/20 px-1.5 align-super text-[10px] font-semibold text-yellow-300 transition hover:bg-yellow-500/40 cursor-pointer"
      >
        {n}
      </button>
      {source && tip && typeof document !== "undefined" &&
        createPortal(
          <span
            className="pointer-events-none fixed z-[100] w-72 rounded-lg border border-white/10 bg-[#1a1a1c] p-3 text-left shadow-xl"
            style={{
              left: tip.left,
              top: tip.top,
              transform: tip.placement === "top" ? "translateY(-100%)" : "none",
            }}
          >
            <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-yellow-300">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{source.title || `Πηγή ${n}`}</span>
            </span>
            {source.snippet && (
              <span className="block max-h-28 overflow-hidden text-[11px] leading-relaxed text-gray-300">
                …{source.snippet}…
              </span>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}

// Renderer που μετατρέπει **bold** σε πραγματικό bold και τα [n] σε clickable citations.
function renderInline(
  text: string,
  sources: RagSource[],
  onCite: (n: string) => void,
  keyPrefix: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  BOLD_OR_CITE_RE.lastIndex = 0;

  while ((m = BOLD_OR_CITE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));

    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${key++}`} className="font-semibold text-white">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      const n = m[2];
      const source = sources.find((s) => s.id === n);
      nodes.push(
        <CitationBadge
          key={`${keyPrefix}-c-${key++}`}
          n={n}
          source={source}
          onClick={() => onCite(n)}
        />,
      );
    }
    last = BOLD_OR_CITE_RE.lastIndex;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Render του assistant κειμένου με bold + clickable citations + διατήρηση γραμμών.
function MessageContent({
  content,
  sources,
  onCite,
}: {
  content: string;
  sources: RagSource[];
  onCite: (n: string) => void;
}) {
  const lines = content.split("\n");
  return (
    <>
      {lines.map((line, li) =>
        line.trim() === "" ? (
          <span key={li} className="block h-2" />
        ) : (
          <span key={li} className="block">
            {renderInline(line, sources, onCite, `l${li}`)}
          </span>
        ),
      )}
    </>
  );
}

// Collapsable reasoning block — εμφανίζεται πάνω από το chat bubble.
function ReasoningBlock({ text, streaming }: { text: string; streaming: boolean }) {  const [open, setOpen] = useState(false);
  const collapsedOnce = useRef(false);

  useEffect(() => {
    if (!streaming && !collapsedOnce.current) {
      setOpen(false);
      collapsedOnce.current = true;
    }
  }, [streaming]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-2 text-sm text-gray-400 transition hover:text-gray-200"
      >
        <Loader
          size={18}
          strokeWidth={2.5}
          className={streaming ? "text-yellow-300" : "text-gray-400"}
        />
        <span className="font-medium">{streaming ? "Σκέφτομαι…" : "Σκεπτικό"}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="whitespace-pre-wrap py-1 text-[13px] leading-relaxed text-gray-400">
          {text}
        </div>
      )}
    </div>
  );
}

// Χαιρετισμός ανάλογα με την ώρα της ημέρας (καλημέρα/καλησπέρα).
function greetingForNow(): string {
  const h = new Date().getHours();
  return h < 12 ? "Καλημέρα" : "Καλησπέρα";
}

export default function ChatbotPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [streamingMsg, setStreamingMsg] = useState(false);
  const [activeCite, setActiveCite] = useState<string | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [activePdfTitle, setActivePdfTitle] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Φέρνουμε το όνομα του χρήστη για το προσωποποιημένο μήνυμα καλωσορίσματος.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      supabase
        .from("profiles")
        .select("first_name")
        .eq("id", user.id)
        .single()
        .then(({ data: profile }) => {
          if (mounted && profile?.first_name) setFirstName(profile.first_name);
        });
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, requesting]);

  // Escape για κλείσιμο του PDF viewer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activePdfUrl) {
        setActivePdfUrl(null);
        setActivePdfTitle(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePdfUrl]);

  // Άνοιγμα PDF viewer για μια πηγή (με auto-scroll/highlight στους όρους).
  const openSourcePdf = (src: RagSource) => {
    if (!src.pdfPath) return;
    setActivePdfUrl(buildPdfUrl(src.pdfPath, [], src.searchTerms || ""));
    setActivePdfTitle(src.title || src.arithmos || "Προβολή Εγγράφου");
  };

  // Citation click → scroll στο αντίστοιχο source chip + προσωρινό highlight
  const handleCite = (msgIndex: number, n: string) => {
    const id = `src-${msgIndex}-${n}`;
    setActiveCite(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      setActiveCite((c) => (c === id ? null : c));
    }, 2000);
  };

// Παρσάρει το sources footer που στέλνει το backend ως plain text στο τέλος του stream.
  // Μορφή: "\n\n**Πηγές:**\n[1] Τίτλος|@|snippet|@|pdf_path\n[2] ..."
  const parseSourcesFooter = (raw: string): { content: string; sources: RagSource[] } => {
    const SEPARATOR = "**Πηγές:**";
    const idx = raw.indexOf(SEPARATOR);
    if (idx === -1) return { content: raw, sources: [] };

    const content = raw.slice(0, idx).trim();
    const footerBlock = raw.slice(idx + SEPARATOR.length).trim();

    const sources: RagSource[] = footerBlock
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // Μορφή: "[1] Τίτλος|@|snippet|@|pdf_path|@|keywords"
        const match = line.match(/^\[(\d+)\]\s*(.+)$/);
        if (match) {
          const [title, snippet, pdfPath, keywords] = match[2].split("|@|");
          return {
            id: match[1],
            title: (title || "").trim(),
            snippet: (snippet || "").trim() || undefined,
            pdfPath: (pdfPath || "").trim() || undefined,
            searchTerms: (keywords || "").trim() || undefined,
          };
        }
        return { title: line };
      });

    return { content, sources };
  };

const handleSubmit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
      { role: "assistant", content: "", sources: [] },
    ]);

    setRequesting(true);

    try {
      const response = await fetch("http://localhost:8000/api/fact-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, top_k: 5, katigoria: [], ypokatigoria: [] }),
      });

      if (!response.ok) throw new Error(`${response.status}`);
      if (!response.body) throw new Error("No response body");

      setRequesting(false);
      setStreamingMsg(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullRaw = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fullRaw += decoder.decode(value, { stream: true });

        // Ενημερώνουμε live
        setMessages((prev) => {
          const msgs = [...prev];
          const { content: withThink, sources } = parseSourcesFooter(fullRaw);
          const { reasoning, content } = parseThink(withThink);
          msgs[msgs.length - 1] = { role: "assistant", content, reasoning, sources };
          return msgs;
        });
      }

      // Τελικό parse μετά το τέλος του stream
      setMessages((prev) => {
        const msgs = [...prev];
        const { content: withThink, sources } = parseSourcesFooter(fullRaw);
        const { reasoning, content } = parseThink(withThink);
        msgs[msgs.length - 1] = { role: "assistant", content, reasoning, sources };
        return msgs;
      });

      setStreamingMsg(false);

    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = {
          role: "assistant",
          content: "Δεν μπόρεσα να επικοινωνήσω με το backend. Βεβαιώσου ότι τρέχουν FastAPI και LMStudio.",
        };
        return msgs;
      });
      setRequesting(false);
      setStreamingMsg(false);
    }
  };

  return (
    <div className="h-screen text-white font-sans relative overflow-hidden selection:bg-yellow-500/30 flex flex-col">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <BackgroundGradientAnimation interactive />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* ── NAVBAR (same as homepage) ── */}
      <nav className="sticky top-0 z-10 shrink-0">
        <div className="flex items-center px-8 py-6 max-w-7xl mx-auto">
          <div className="flex-1 flex items-center gap-3">
            <Scale className="w-8 h-8 text-white" />
            <span className="text-xl font-bold tracking-wider">PLACEHOLDER</span>
          </div>

          <div className="hidden md:flex bg-[#1a1a1c]/80 backdrop-blur-sm border border-gray-800 rounded-full shadow-lg p-1">
            <button
              onClick={() => router.push("/")}
              className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium"
            >
              Αρχική
            </button>
            <button
              onClick={() => router.push("/results")}
              className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium"
            >
              Αρχείο
            </button>
            <button className="px-6 py-2.5 rounded-full bg-white text-black text-sm font-medium">
              AI Chatbot
            </button>
            <AdminNavLink />
          </div>

          <div className="flex-1 flex items-center justify-end gap-6">
            <AuthButton />
          </div>
        </div>
      </nav>

      {/* ── CHAT AREA ── */}
      <main className="relative z-10 flex flex-1 min-h-0 flex-col items-center px-4 pb-4 w-full max-w-5xl mx-auto">

        {/* Messages */}
        <div className="custom-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto w-full pr-1 mb-2">
          {messages.length === 0 && (
            // να παει στην μεση της οθονης και να ειναι responsive
            <div className="flex flex-col py-40 justify-center items-center justify-center text-center">
              <p className="text-gray-300 text-[36px] text-center">
                {greetingForNow()}<strong>{firstName ? ` ${firstName}` : ""}</strong>! Πώς μπορώ να βοηθήσω;
              </p>
              </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="mt-1 shrink-0 rounded-full bg-white/10 p-1.5 self-start">
                  <Bot className="h-4 w-4 text-gray-300" />
                </div>
              )}

              <div className={`flex flex-col gap-2 max-w-[80%]`}>
                {msg.role === "assistant" && msg.reasoning && (
                  <ReasoningBlock
                    text={msg.reasoning}
                    streaming={streamingMsg && i === messages.length - 1}
                  />
                )}

                {(msg.content || msg.role === "user") && (
                  <div
                    className={`rounded-2xl bg-white/10 backdrop-blur-sm px-5 py-3.5 text-sm text-gray-100 leading-relaxed ${
                      msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <MessageContent
                        content={msg.content}
                        sources={msg.sources || []}
                        onCite={(n) => handleCite(i, n)}
                      />
                    ) : (
                      msg.content
                    )}
                  </div>
                )}

                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 pl-1">
                    {msg.sources.map((src, si) => {
                      const chipId = `src-${i}-${src.id ?? si + 1}`;
                      const clickable = Boolean(src.pdfPath);
                      const active = activeCite === chipId;
                      const { Icon: SrcIcon, color: srcColor } = getFileTypeStyle(src.pdfPath);
                      return (
                        <button
                          key={si}
                          type="button"
                          id={chipId}
                          onClick={() => openSourcePdf(src)}
                          disabled={!clickable}
                          title={
                            clickable
                              ? "Άνοιγμα PDF"
                              : src.snippet
                              ? `…${src.snippet}…`
                              : undefined
                          }
                          style={{
                            ['--file-color' as string]: srcColor,
                            backgroundColor: `color-mix(in oklch, ${srcColor} ${active ? 28 : 14}%, transparent)`,
                            borderColor: active ? srcColor : 'transparent',
                            boxShadow: active ? `0 0 0 1px ${srcColor}` : undefined,
                          } as React.CSSProperties}
                          className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] text-gray-300 transition ${
                            clickable
                              ? "cursor-pointer hover:[border-color:var(--file-color)] hover:text-white"
                              : "cursor-default"
                          }`}
                        >
                          <span className="font-semibold">
                            [{src.id ?? si + 1}]
                          </span>
                          <SrcIcon className="h-3.5 w-3.5" style={{ color: srcColor }} />
                          <span className="max-w-[18rem] truncate">{src.arithmos || src.title || "Πηγή"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="mt-1 shrink-0 rounded-full bg-white/10 p-1.5 self-start">
                  <User className="h-4 w-4 text-gray-300" />
                </div>
              )}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="w-full shrink-0">
          <AIInputWithLoading
            onSubmit={handleSubmit}
            loadingDuration={800}
            thinkingDuration={300}
            placeholder="Ρώτησε κάτι για τη νομοθεσία..."
            minHeight={56}
            maxHeight={220}
          />
        </div>
      </main>

      {/* PDF Viewer Overlay */}
      {activePdfUrl && (
        <PdfViewer
          url={activePdfUrl}
          title={activePdfTitle}
          onClose={() => {
            setActivePdfUrl(null);
            setActivePdfTitle(null);
          }}
        />
      )}
    </div>
  );
}