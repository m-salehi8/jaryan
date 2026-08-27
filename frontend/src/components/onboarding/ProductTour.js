import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, ArrowRight, MapPin } from "lucide-react";

// ─── Tour step definitions ───────────────────────────────────────────────────

const TOUR_STEPS = [
  {
    id: "step-dashboard",
    targetId: "tour-dashboard",
    placement: "bottom",
    title: "به روند خوش آمدید 👋",
    body: "اینجا می‌توانید تمام فرایندهای در حال اجرا و تاییدیه‌های معلق سازمان خود را یکجا رصد کنید.",
  },
  {
    id: "step-ai",
    targetId: "tour-nav-chat",
    placement: "left",
    title: "ساخت فرایند با هوش مصنوعی ✨",
    body: "نمی‌دانید از کجا شروع کنید؟ کافی است به فارسی بنویسید چه فرایندی نیاز دارید — هوش مصنوعی ما آن را برایتان طراحی می‌کند.",
  },
  {
    id: "step-workflows",
    targetId: "tour-nav-workflows",
    placement: "left",
    title: "بوم طراحی پیشرفته 🗺️",
    body: "فرایندهای خود را به‌صورت بصری طراحی کنید. از ارجاع داینامیک برای ارسال خودکار به مدیر مستقیم و دسترسی سطح فیلد (قابل ویرایش، فقط نمایش، یا مخفی) برای هر مرحله استفاده کنید.",
  },
  {
    id: "step-safe",
    targetId: "tour-dashboard",
    placement: "center",
    title: "اجرای امن ✅",
    body: "با خیال راحت ویرایش کنید. فرایندهای در حال اجرا از یک نسخه‌ی ثابت قالب استفاده می‌کنند — تغییر قالب، درخواست‌های فعال را خراب نمی‌کند.",
  },
  {
    id: "step-inbox",
    targetId: "tour-nav-inbox",
    placement: "left",
    title: "کارتابل تیم 📬",
    body: "وظایف تیم شما اینجا می‌رسند. بر اساس دسترسی‌های فیلد هر مرحله، تاییدیه، رد، یا نظردهی کنید.",
  },
];

// ─── Hook: resolve target element rect ───────────────────────────────────────

function useTargetRect(targetId, active) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!active) { setRect(null); return; }
    const el = document.querySelector(`[data-tour-id="${targetId}"]`);
    if (!el) { setRect(null); return; }

    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [targetId, active]);

  return rect;
}

// ─── Tooltip positioning ──────────────────────────────────────────────────────

const PAD = 16; // gap between tooltip and target

function getTooltipStyle(rect, placement, tooltipW = 320, tooltipH = 160) {
  if (!rect || placement === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const { top, left, width, height } = rect;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (placement === "left") {
    // In RTL layout, "left" visually means appearing to the LEFT of element on screen
    // Sidebar is on the right in RTL — tooltip goes to the left of target
    let tLeft = left - tooltipW - PAD;
    let tTop = top + height / 2 - tooltipH / 2;

    // Clamp within viewport
    tLeft = Math.max(PAD, Math.min(tLeft, vw - tooltipW - PAD));
    tTop = Math.max(PAD, Math.min(tTop, vh - tooltipH - PAD));

    return { position: "fixed", top: tTop, left: tLeft };
  }

  if (placement === "right") {
    let tLeft = left + width + PAD;
    let tTop = top + height / 2 - tooltipH / 2;
    tLeft = Math.max(PAD, Math.min(tLeft, vw - tooltipW - PAD));
    tTop = Math.max(PAD, Math.min(tTop, vh - tooltipH - PAD));
    return { position: "fixed", top: tTop, left: tLeft };
  }

  if (placement === "bottom") {
    let tLeft = left + width / 2 - tooltipW / 2;
    let tTop = top + height + PAD;
    tLeft = Math.max(PAD, Math.min(tLeft, vw - tooltipW - PAD));
    tTop = Math.max(PAD, Math.min(tTop, vh - tooltipH - PAD));
    return { position: "fixed", top: tTop, left: tLeft };
  }

  // top
  let tLeft = left + width / 2 - tooltipW / 2;
  let tTop = top - tooltipH - PAD;
  tLeft = Math.max(PAD, Math.min(tLeft, vw - tooltipW - PAD));
  tTop = Math.max(PAD, Math.min(tTop, vh - tooltipH - PAD));
  return { position: "fixed", top: tTop, left: tLeft };
}

// ─── Spotlight backdrop ───────────────────────────────────────────────────────

function Spotlight({ rect }) {
  if (!rect) {
    return (
      <div
        className="fixed inset-0 z-[9998]"
        style={{ background: "rgba(0,0,0,0.55)" }}
      />
    );
  }

  const R = 12; // border-radius of spotlight hole
  const pad = 6;
  const { top, left, width, height } = rect;
  const clipPath = `polygon(
    0% 0%,
    100% 0%,
    100% 100%,
    0% 100%,
    0% 0%,
    ${left - pad}px ${top - pad}px,
    ${left - pad}px ${top + height + pad}px,
    ${left + width + pad}px ${top + height + pad}px,
    ${left + width + pad}px ${top - pad}px,
    ${left - pad}px ${top - pad}px
  )`;

  return (
    <>
      {/* Dark overlay with cutout */}
      <div
        className="fixed inset-0 z-[9998] pointer-events-none"
        style={{
          background: "rgba(0,0,0,0.55)",
          clipPath,
          transition: "clip-path 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
      {/* Spotlight ring */}
      <div
        className="fixed z-[9998] pointer-events-none"
        style={{
          top: top - pad,
          left: left - pad,
          width: width + pad * 2,
          height: height + pad * 2,
          borderRadius: R,
          boxShadow: "0 0 0 2px rgba(255,255,255,0.35), 0 0 0 4px rgba(255,255,255,0.1)",
          transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </>
  );
}

// ─── Step dots ────────────────────────────────────────────────────────────────

function StepDots({ total, current }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? 20 : 6,
            height: 6,
            background: i === current ? "#171717" : "#d4d4d4",
          }}
        />
      ))}
    </div>
  );
}

// ─── Main ProductTour component ───────────────────────────────────────────────

/**
 * ProductTour
 *
 * Props:
 *   active    {boolean}  — whether the tour is running
 *   onClose   {Function} — called when the tour is closed or completed
 */
export default function ProductTour({ active, onClose }) {
  const [step, setStep] = useState(0);
  const tooltipRef = useRef(null);

  const currentStep = TOUR_STEPS[step];
  const rect = useTargetRect(currentStep?.targetId, active);

  // Reset to step 0 whenever the tour opens
  useEffect(() => {
    if (active) setStep(0);
  }, [active]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") handleNext();   // RTL: ArrowLeft = forward
      if (e.key === "ArrowRight") handlePrev();  // RTL: ArrowRight = back
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  const handleNext = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      onClose();
    }
  }, [step, onClose]);

  const handlePrev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const tooltipStyle = getTooltipStyle(rect, currentStep?.placement);

  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Backdrop + spotlight */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Spotlight rect={rect} />
          </motion.div>

          {/* Tooltip card */}
          <motion.div
            key={currentStep.id}
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{
              ...tooltipStyle,
              zIndex: 9999,
              width: 320,
            }}
            className="rounded-2xl bg-card border border-border shadow-[0_24px_64px_rgba(0,0,0,0.14)] p-5 select-none"
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary grid place-items-center shrink-0">
                  <MapPin className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
                  مرحله {step + 1} از {TOUR_STEPS.length}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
                aria-label="بستن تور"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Title */}
            <h3 className="text-base font-bold text-foreground mb-2 leading-snug">
              {currentStep.title}
            </h3>

            {/* Body */}
            <p className="text-sm text-muted-foreground leading-6 mb-5">
              {currentStep.body}
            </p>

            {/* Footer: dots + nav buttons */}
            <div className="flex items-center justify-between">
              <StepDots total={TOUR_STEPS.length} current={step} />

              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    onClick={handlePrev}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    قبلی
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-colors"
                >
                  {step === TOUR_STEPS.length - 1 ? "پایان" : "بعدی"}
                  {step < TOUR_STEPS.length - 1 && (
                    <ArrowLeft className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
