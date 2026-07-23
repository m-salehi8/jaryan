import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Sparkles,
  GitBranch,
  Users,
  X,
  ArrowLeft,
  Play,
  ChevronLeft,
} from "lucide-react";

// ─── Quick-start steps ────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "ai-process",
    icon: Sparkles,
    iconBg: "linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)",
    label: "ساخت اولین فرایند با هوش مصنوعی",
    sublabel: "فقط بنویسید چه فرایندی نیاز دارید",
    to: "/admin/chat",
    testId: "quickstart-ai",
  },
  {
    id: "permissions",
    icon: GitBranch,
    iconBg: "linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%)",
    label: "تنظیم دسترسی‌ها و ارجاعات داینامیک",
    sublabel: "مسیریابی خودکار و کنترل دسترسی فیلد",
    to: "/admin/workflows",
    testId: "quickstart-workflows",
  },
  {
    id: "invite",
    icon: Users,
    iconBg: "linear-gradient(135deg,#10b981 0%,#0ea5e9 100%)",
    label: "دعوت از هم‌تیمی‌ها",
    sublabel: "اعضای تیم را به سازمان اضافه کنید",
    to: "/admin/users",
    testId: "quickstart-users",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * QuickStartWidget
 *
 * Props:
 *   onDismiss    {Function}  — called when the user dismisses the card
 *   onStartTour  {Function}  — called when the user clicks "شروع تور"
 */
export default function QuickStartWidget({ onDismiss, onStartTour }) {
  return (
    <AnimatePresence>
      <motion.div
        key="quick-start-widget"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        data-testid="quick-start-widget"
        className="mb-8 relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_16px_rgba(0,0,0,0.06)]"
      >
        {/* Subtle shimmer gradient strip at top */}
        <div
          className="absolute top-0 inset-x-0 h-[3px] rounded-t-2xl"
          style={{
            background:
              "linear-gradient(90deg,#4f46e5 0%,#818cf8 40%,#c7d2fe 70%,#4f46e5 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 3s linear infinite",
          }}
        />

        <div className="p-6 pt-7">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-foreground leading-tight">
                آشنایی با جریان و شروع سریع
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                سه قدم ساده تا راه‌اندازی کامل سازمان شما
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Launch tour button */}
              <button
                onClick={onStartTour}
                data-testid="quickstart-start-tour"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted hover:border-border transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-neutral-700" />
                شروع تور راهنما
              </button>

              {/* Dismiss button */}
              <button
                onClick={onDismiss}
                data-testid="quickstart-dismiss"
                className="p-2 rounded-lg text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
                aria-label="بستن"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Steps grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <Link
                  key={step.id}
                  to={step.to}
                  data-testid={step.testId}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-neutral-150 hover:border-border hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] bg-muted hover:bg-card transition-all duration-200"
                >
                  {/* Step number */}
                  <div className="shrink-0 w-5 h-5 rounded-full bg-neutral-200 group-hover:bg-primary text-muted-foreground group-hover:text-white text-[11px] font-bold grid place-items-center transition-colors">
                    {idx + 1}
                  </div>

                  {/* Icon */}
                  <div
                    className="shrink-0 w-9 h-9 rounded-xl grid place-items-center shadow-sm"
                    style={{ background: step.iconBg }}
                  >
                    <Icon className="w-4.5 h-4.5 text-white" strokeWidth={2} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground leading-snug">
                      {step.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {step.sublabel}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronLeft className="w-4 h-4 text-neutral-300 group-hover:text-muted-foreground transition-colors shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
