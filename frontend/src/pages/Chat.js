import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Send, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { api, streamAI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTIONS = [
  "فرایند درخواست مرخصی بساز",
  "فرایند تایید خرید با دو سطح تایید طراحی کن",
  "فرایند آنبوردینگ کارمند جدید بساز",
  "فرایند درخواست تجهیزات IT بساز",
];

export default function Chat() {
  const nav = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lastWorkflow, setLastWorkflow] = useState(null);
const [sessionId] = useState(() => {
    // crypto.randomUUID() only works on HTTPS or localhost
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback UUID v4 for plain HTTP
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  });
  const scrollerRef = useRef(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: "" }]);
    setStreaming(true);
    setLastWorkflow(null);

    await streamAI(
      content,
      sessionId,
      (delta) => {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + delta };
          return copy;
        });
      },
      (wf) => {
        setStreaming(false);
        if (wf && wf.nodes && wf.edges) {
          setLastWorkflow(wf);
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { ...copy[copy.length - 1], generated_workflow: wf };
            return copy;
          });
        }
      },
      (err) => {
        setStreaming(false);
        toast.error("خطا در پاسخ هوش مصنوعی");
        console.error(err);
      }
    );
  };

  const saveWorkflow = async () => {
    if (!lastWorkflow) return;
    try {
      const r = await api.post("/workflows", {
        name: lastWorkflow.name || "فرایند بدون نام",
        description: lastWorkflow.description || "",
        nodes: lastWorkflow.nodes || [],
        edges: lastWorkflow.edges || [],
      });
      toast.success("فرایند ذخیره شد. درحال انتقال به ویرایشگر…");
      setTimeout(() => nav(`/admin/workflows/${r.data.id}`), 400);
    } catch (e) {
      toast.error("خطا در ذخیره فرایند");
    }
  };

  // Render assistant text without the embedded ```json``` block
  const renderText = (content) => {
    const cleaned = content.replace(/```json[\s\S]*?```/g, "").trim();
    return cleaned;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] md:h-screen" data-testid="chat-root">
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-foreground" />
          <h1 className="text-sm font-semibold">ساخت فرایند با هوش مصنوعی</h1>
          <span className="mono text-[10px] text-muted-foreground ms-2">Kimi K2.5</span>
        </div>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-auto px-4 md:px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-12 animate-in" data-testid="chat-empty">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand to-brand-strong text-white mb-4 shadow-[0_8px_20px_rgba(79,70,229,0.3)]">
                <Sparkles className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">یک فرایند جدید بسازیم؟</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                به زبان طبیعی توضیح بده چه فرایندی می‌خواهی. هوش مصنوعی گام‌ها، نقش‌ها و فرم‌ها را برایت می‌سازد.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <Button variant="ghost"
                    key={s}
                    data-testid={`suggestion-${s.slice(0, 8)}`}
                    onClick={() => send(s)}
                    className="h-auto w-full justify-start text-right px-4 py-3 rounded-lg border border-border hover:border-brand hover:bg-brand-soft hover:text-brand transition-colors text-sm text-muted-foreground whitespace-normal"
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-start"} animate-in`} data-testid={`chat-msg-${i}`}>
              {m.role === "user" ? (
                <div className="ms-auto max-w-[80%] bg-gradient-to-br from-brand to-brand-strong text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-7 shadow-sm">
                  {m.content}
                </div>
              ) : (
                <div className="me-auto max-w-[80%]">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand to-brand-strong text-white grid place-items-center text-[10px] font-bold">AI</div>
                    <span className="text-xs text-muted-foreground">دستیار جریان</span>
                  </div>
                  <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-7 text-foreground whitespace-pre-wrap">
                    {renderText(m.content) || (streaming && i === messages.length - 1 ? "…" : "")}
                  </div>

                  {m.generated_workflow && (
                    <div className="mt-3 bg-card border border-border rounded-xl p-4" data-testid="workflow-preview">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-xs text-muted-foreground">پیش‌نمایش فرایند</div>
                          <div className="font-semibold">{m.generated_workflow.name}</div>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {m.generated_workflow.nodes?.map((n, idx) => (
                          <div key={n.id} className="flex items-center gap-2 shrink-0">
                            <div className="border border-border rounded-lg px-3 py-2 min-w-[140px]">
                              <div className="text-[10px] text-muted-foreground mono uppercase">{n.type}</div>
                              <div className="text-xs font-medium text-foreground">{n.label}</div>
                            </div>
                            {idx < m.generated_workflow.nodes.length - 1 && <ArrowLeft className="w-3.5 h-3.5 text-neutral-300" />}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button
                          data-testid="save-generated-workflow"
                          onClick={saveWorkflow}
                          className="bg-primary hover:opacity-90 text-primary-foreground"
                        >
                          ذخیره و باز کردن در ویرایشگر
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {streaming && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs ps-9">
              <Loader2 className="w-3 h-3 animate-spin" />
              در حال تولید…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-card px-4 md:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 rounded-xl border border-border focus-within:border-neutral-900 bg-card px-3"
          >
            <Input
              data-testid="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="یک فرایند توصیف کن…   مثلاً: فرایند درخواست مرخصی بساز"
              className="flex-1 bg-transparent py-3 text-sm focus:outline-none"
              disabled={streaming}
            />
            <Button variant="ghost" size="icon"
              type="submit"
              data-testid="chat-send"
              disabled={streaming || !input.trim()}
              className="h-9 w-9 flex-shrink-0 p-2 rounded-md bg-brand text-white hover:bg-brand-strong disabled:opacity-40 transition shadow-[0_4px_14px_rgba(79,70,229,0.25)]"
            >
              <Send className="w-4 h-4 rotate-180" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
