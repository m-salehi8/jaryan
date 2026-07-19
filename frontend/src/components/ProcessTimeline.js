import { useState, useRef } from "react";
import { AlertTriangle, Clock, User, CheckCircle2, Timer } from "lucide-react";
import { toJalaliDateTime } from "@/lib/jalali";

// ─── helpers ─────────────────────────────────────────────────────────────────

function ms(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

/** Format millisecond duration to a human-readable Persian string. */
function fmtDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) return "—";
  const totalSec = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days} روز`);
  if (hours > 0) parts.push(`${hours} ساعت`);
  if (mins > 0 && days === 0) parts.push(`${mins} دقیقه`);
  if (parts.length === 0) parts.push("کمتر از یک دقیقه");
  return parts.join(" و ");
}

const TASK_STATUS_LABEL = {
  waiting: "در انتظار",
  pending: "معلق",
  in_progress: "در جریان",
  approved: "تأیید شده",
  rejected: "رد شده",
  done: "انجام شده",
};

const TASK_TYPE_LABEL = {
  task: "تسک",
  approval: "تأیید",
  form: "فرم",
};

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ task, assigneeName, pendingMs, activeMs, totalMs, slaBreached, style }) {
  return (
    <div
      data-testid="timeline-tooltip"
      className="pointer-events-none absolute z-50 w-72 rounded-xl border border-neutral-200 bg-white shadow-xl p-4 text-right"
      style={style}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex flex-col gap-1 text-right flex-1">
          <div className="text-xs text-neutral-400 uppercase tracking-wide">
            {TASK_TYPE_LABEL[task.type] || task.type}
          </div>
          <div className="text-sm font-semibold text-neutral-900 leading-snug">{task.title}</div>
        </div>
        {slaBreached && (
          <div className="shrink-0 w-6 h-6 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          </div>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center justify-between text-xs mb-3">
        <span className="text-neutral-400">وضعیت</span>
        <span className="font-medium text-neutral-800">
          {TASK_STATUS_LABEL[task.status] || task.status}
        </span>
      </div>

      {/* Assignee */}
      {assigneeName && (
        <div className="flex items-center justify-between text-xs mb-3">
          <span className="text-neutral-400 flex items-center gap-1">
            <User className="w-3 h-3" /> مسئول
          </span>
          <span className="font-medium text-neutral-800">{assigneeName}</span>
        </div>
      )}

      {/* Duration rows */}
      <div className="border-t border-neutral-100 pt-3 space-y-2">
        <DurationRow label="انتظار" color="bg-neutral-300" duration={pendingMs} />
        <DurationRow label="در جریان" color="bg-neutral-700" duration={activeMs} />
        <DurationRow label="کل" color="bg-neutral-500" duration={totalMs} bold />
      </div>

      {/* Deadline */}
      {task.deadline && (
        <div className="border-t border-neutral-100 mt-3 pt-3 text-xs flex items-center justify-between">
          <span className="text-neutral-400 flex items-center gap-1">
            <Timer className="w-3 h-3" /> مهلت
          </span>
          <span className={slaBreached ? "text-red-600 font-semibold" : "text-neutral-700"}>
            {toJalaliDateTime(task.deadline)}
          </span>
        </div>
      )}
    </div>
  );
}

function DurationRow({ label, color, duration, bold }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5 text-neutral-500">
        <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
        {label}
      </div>
      <span className={bold ? "font-semibold text-neutral-900" : "text-neutral-700"}>
        {fmtDuration(duration)}
      </span>
    </div>
  );
}

// ─── Individual task row ──────────────────────────────────────────────────────

function TaskRow({ task, processStartMs, totalSpanMs, usersMap }) {
  const [tooltip, setTooltip] = useState(null);
  const rowRef = useRef(null);

  const now = Date.now();
  const createMs = ms(task.created_at) ?? processStartMs;
  const seenMs = ms(task.seen_time);
  const doneMs = ms(task.done_time);
  const deadlineMs = ms(task.deadline);

  // Active (still running): extend bar to now
  const effectiveDone = doneMs ?? (["done", "approved", "rejected"].includes(task.status) ? now : null);
  const effectiveSeen = seenMs ?? (task.status === "in_progress" ? now : null);

  // Durations for tooltip
  const pendingMs = seenMs
    ? seenMs - createMs
    : task.status === "in_progress"
    ? null
    : task.status === "pending"
    ? now - createMs
    : effectiveDone
    ? effectiveDone - createMs
    : null;

  const activeMs = effectiveSeen && effectiveDone ? effectiveDone - effectiveSeen : null;
  const totalMs = effectiveDone ? effectiveDone - createMs : now - createMs;

  // SLA check
  const isTerminal = ["done", "approved", "rejected"].includes(task.status);
  const slaBreached =
    deadlineMs &&
    (!isTerminal ? now > deadlineMs : effectiveDone && effectiveDone > deadlineMs);

  // Position calculations (0..1 relative to totalSpanMs)
  function pct(absMs) {
    if (!totalSpanMs || totalSpanMs <= 0) return 0;
    const offset = absMs - processStartMs;
    return Math.max(0, Math.min(1, offset / totalSpanMs));
  }

  const barStart = pct(createMs);
  const seenPct = seenMs ? pct(seenMs) : null;
  const donePct = effectiveDone ? pct(effectiveDone) : pct(now);
  const deadlinePct = deadlineMs ? pct(deadlineMs) : null;

  // Width of pending and active segments within the bar
  const pendingWidth = seenPct !== null ? seenPct - barStart : donePct - barStart;
  const activeWidth = seenPct !== null ? donePct - seenPct : 0;
  const isLive = !isTerminal;

  function handleMouseMove(e) {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Tooltip above the row, clamped to viewport
    const left = Math.min(e.clientX - rect.left - 144, rect.width - 288);
    setTooltip({ x: Math.max(0, left), y: -160 });
  }

  const assigneeName =
    task.assignee_id && usersMap[task.assignee_id]
      ? usersMap[task.assignee_id].full_name
      : task.assignee_role || null;

  return (
    <div
      ref={rowRef}
      data-testid={`timeline-row-${task.id}`}
      className={`relative flex items-center gap-3 px-4 py-2.5 border-b border-neutral-100 last:border-0 group transition-colors duration-150 ${
        slaBreached ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-neutral-50/60"
      }`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTooltip(null)}
    >
      {/* Task label column — fixed width, RTL */}
      <div className="w-44 shrink-0 flex items-center gap-2 text-right">
        {slaBreached && (
          <AlertTriangle
            data-testid={`sla-warning-${task.id}`}
            className="w-3.5 h-3.5 text-red-500 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-neutral-800 truncate">{task.title}</div>
          <div className="text-[10px] text-neutral-400 mt-0.5">
            {TASK_TYPE_LABEL[task.type] || task.type} ·{" "}
            {TASK_STATUS_LABEL[task.status] || task.status}
          </div>
        </div>
      </div>

      {/* Gantt bar track */}
      <div className="flex-1 relative h-6 rounded-full bg-neutral-100 overflow-hidden">
        {/* Pending segment (gray) */}
        {pendingWidth > 0 && (
          <div
            data-testid={`bar-pending-${task.id}`}
            className={`absolute top-0 h-full rounded-full ${
              isLive && !seenMs ? "bg-neutral-300 animate-pulse" : "bg-neutral-300"
            }`}
            style={{
              left: `${barStart * 100}%`,
              width: `${pendingWidth * 100}%`,
            }}
          />
        )}

        {/* In-Progress segment (dark) */}
        {activeWidth > 0 && (
          <div
            data-testid={`bar-active-${task.id}`}
            className={`absolute top-0 h-full rounded-full ${
              isLive ? "bg-neutral-700" : "bg-neutral-700"
            }`}
            style={{
              left: `${seenPct * 100}%`,
              width: `${activeWidth * 100}%`,
            }}
          >
            {/* Animated shimmer for live tasks */}
            {isLive && (
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                    animation: "shimmer 2s infinite",
                    backgroundSize: "200% 100%",
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Deadline tick mark */}
        {deadlinePct !== null && deadlinePct >= 0 && deadlinePct <= 1 && (
          <div
            data-testid={`deadline-tick-${task.id}`}
            className={`absolute top-0 h-full w-0.5 ${
              slaBreached ? "bg-red-500" : "bg-amber-400"
            }`}
            style={{ left: `${deadlinePct * 100}%` }}
          />
        )}
      </div>

      {/* Status dot (right side) */}
      <div className="shrink-0">
        {isTerminal ? (
          <CheckCircle2 className="w-4 h-4 text-neutral-400" />
        ) : (
          <Clock className="w-4 h-4 text-neutral-400 animate-spin" style={{ animationDuration: "4s" }} />
        )}
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <Tooltip
          task={task}
          assigneeName={assigneeName}
          pendingMs={pendingMs}
          activeMs={activeMs}
          totalMs={totalMs}
          slaBreached={slaBreached}
          style={{ top: `${tooltip.y}px`, left: `${tooltip.x}px` }}
        />
      )}
    </div>
  );
}

// ─── Time ruler ──────────────────────────────────────────────────────────────

function TimeRuler({ processStartMs, totalSpanMs }) {
  if (!totalSpanMs || totalSpanMs <= 0) return null;

  const totalHours = totalSpanMs / (1000 * 3600);
  const tickInterval =
    totalHours <= 6 ? 1 : totalHours <= 24 ? 4 : totalHours <= 72 ? 12 : 24;
  const tickCount = Math.min(Math.floor(totalHours / tickInterval) + 1, 20);

  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const offsetMs = i * tickInterval * 3600 * 1000;
    const pct = (offsetMs / totalSpanMs) * 100;
    const label =
      tickInterval < 24
        ? `${i * tickInterval}h`
        : `${Math.round((i * tickInterval) / 24)}d`;
    return { pct, label };
  });

  return (
    <div className="flex items-center gap-3 px-4 pb-1">
      {/* Align with label column */}
      <div className="w-44 shrink-0" />
      {/* Ruler track */}
      <div className="flex-1 relative h-5">
        {ticks.map((tick, i) => (
          <div
            key={i}
            className="absolute flex flex-col items-center"
            style={{ left: `${tick.pct}%`, transform: "translateX(-50%)" }}
          >
            <div className="w-px h-2 bg-neutral-300" />
            <span className="text-[9px] text-neutral-400 mt-0.5 whitespace-nowrap mono">
              {tick.label}
            </span>
          </div>
        ))}
        {/* Now marker */}
        <div
          className="absolute top-0 h-2 w-px bg-emerald-500"
          style={{ left: "100%", transform: "translateX(-50%)" }}
        />
      </div>
      <div className="shrink-0 w-4" />
    </div>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-b border-neutral-100 bg-neutral-50/50 text-[11px] text-neutral-500">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-2 rounded-sm bg-neutral-300" />
        در انتظار دیده شدن
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-2 rounded-sm bg-neutral-700" />
        در جریان
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-0.5 h-3 bg-red-500 rounded-full" />
        مهلت (SLA)
      </div>
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="w-3 h-3 text-red-500" />
        گلوگاه
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * ProcessTimeline — horizontal Gantt chart for a single process instance.
 *
 * Props:
 *   process  — the ProcessInstance document (needs created_at)
 *   tasks    — array of Task documents
 *   users    — array of UserPublic documents (for assignee name resolution)
 */
export default function ProcessTimeline({ process, tasks, users }) {
  const usersMap = Object.fromEntries((users || []).map((u) => [u.id, u]));

  if (!tasks || tasks.length === 0) {
    return (
      <div
        data-testid="timeline-empty"
        className="py-16 text-center text-sm text-neutral-400"
      >
        هیچ تسکی برای نمایش در تایم‌لاین وجود ندارد.
      </div>
    );
  }

  const processStartMs = ms(process?.created_at) ?? Date.now();
  const now = Date.now();

  // Sort tasks by create time
  const sorted = [...tasks].sort(
    (a, b) => (ms(a.created_at) ?? 0) - (ms(b.created_at) ?? 0)
  );

  // Total span: from process start to the latest of (now, max done_time, max deadline)
  const endpoints = [now];
  for (const t of tasks) {
    if (t.done_time) endpoints.push(ms(t.done_time));
    if (t.deadline) endpoints.push(ms(t.deadline));
  }
  const spanEndMs = Math.max(...endpoints.filter(Boolean));
  const totalSpanMs = Math.max(spanEndMs - processStartMs, 60 * 1000); // at least 1 min

  const bottleneckCount = tasks.filter((t) => {
    const deadlineMs = ms(t.deadline);
    const isTerminal = ["done", "approved", "rejected"].includes(t.status);
    const effectiveDone = ms(t.done_time) ?? (isTerminal ? now : null);
    return deadlineMs && (isTerminal ? effectiveDone && effectiveDone > deadlineMs : now > deadlineMs);
  }).length;

  return (
    <div data-testid="process-timeline" className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
          <Clock className="w-4 h-4 text-neutral-500" />
          تایم‌لاین فرایند
        </div>
        {bottleneckCount > 0 && (
          <div
            data-testid="bottleneck-summary"
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700"
          >
            <AlertTriangle className="w-3 h-3" />
            {bottleneckCount} گلوگاه تشخیص داده شد
          </div>
        )}
      </div>

      <Legend />

      {/* Time ruler */}
      <div className="pt-2">
        <TimeRuler processStartMs={processStartMs} totalSpanMs={totalSpanMs} />
      </div>

      {/* Task rows */}
      <div>
        {sorted.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            processStartMs={processStartMs}
            totalSpanMs={totalSpanMs}
            usersMap={usersMap}
          />
        ))}
      </div>

      {/* Footer: time range */}
      <div className="px-4 py-2.5 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400">
        <span>آغاز: {toJalaliDateTime(process?.created_at)}</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          اکنون
        </span>
      </div>
    </div>
  );
}
