import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Inbox, Workflow, FileText } from "lucide-react";
import { api } from "@/lib/api";

const SECTION_META = {
  tasks: { title: "تسک‌ها", icon: Inbox, route: "/inbox" },
  processes: { title: "فرایندها", icon: Workflow, route: "/monitoring" },
  forms: { title: "فرم‌ها", icon: FileText, route: (id) => `/forms/${id}` },
};

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const nav = useNavigate();

  const hasQuery = query.trim().length >= 2;

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!hasQuery) {
      setResults(null);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get("/search", { params: { q: query.trim() } });
        setResults(r.data);
        setError(false);
      } catch {
        setResults(null);
        setError(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Focus input on open + Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults(null);
      setLoading(false);
      setError(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNavigate = (section, item) => {
    const meta = SECTION_META[section];
    const route = typeof meta.route === "function" ? meta.route(item.id) : meta.route;
    nav(route);
    onClose();
  };

  const hasAnyResult = results && (
    (results.tasks?.length || 0) +
    (results.processes?.length || 0) +
    (results.forms?.length || 0)
  ) > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4"
      data-testid="command-palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            data-testid="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در تسک‌ها، فرایندها و فرم‌ها…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-neutral-400 shrink-0" />}
          <kbd className="text-[10px] text-neutral-400 border border-neutral-200 rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {!hasQuery ? (
            <div className="text-sm text-neutral-400 py-10 text-center">
              حداقل ۲ کاراکتر تایپ کنید تا جستجو آغاز شود.
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 py-10 text-center">
              خطا در جستجو. دوباره تلاش کنید.
            </div>
          ) : loading ? null : !hasAnyResult ? (
            <div className="text-sm text-neutral-400 py-10 text-center">
              نتیجه‌ای یافت نشد
            </div>
          ) : (
            Object.entries(SECTION_META).map(([section, meta]) => {
              const items = results?.[section] || [];
              if (items.length === 0) return null;
              const Icon = meta.icon;
              return (
                <div key={section} className="mb-2">
                  <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide px-2 py-1.5">
                    {meta.title}
                  </div>
                  {items.map((item) => (
                    <button
                      key={`${section}-${item.id}`}
                      data-testid={`search-result-${section}-${item.id}`}
                      onClick={() => handleNavigate(section, item)}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-100 transition-colors text-right"
                    >
                      <div className="w-7 h-7 rounded-md bg-neutral-100 grid place-items-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-neutral-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-neutral-900 truncate">{item.title}</div>
                        {item.subtitle && (
                          <div className="text-[11px] text-neutral-500 truncate">{item.subtitle}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
