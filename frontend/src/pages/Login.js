import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth, isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Eye, EyeOff, KeyRound, Sparkles } from "lucide-react";

const DEMOS = [
  { email: "admin@jaryan.ir", password: "admin123", role: "مدیر" },
  { email: "employee@jaryan.ir", password: "1234", role: "کارمند" },
];

function CreatureEye({ small = false }) {
  return (
    <span className={`jaryan-eye${small ? " is-small" : ""}`} aria-hidden="true">
      <span className="jaryan-pupil" />
      <span className="jaryan-lid" />
    </span>
  );
}

function Creature({ type, className = "", peeker = false, children }) {
  return (
    <div className={`jaryan-creature-wrap ${className}`}>
      <div className={`jaryan-creature ${type}${peeker ? " is-peeker" : ""}`}>
        <div className="jaryan-face">
          <div className="jaryan-eyes">
            <CreatureEye small={type === "purple" || type === "yellow"} />
            <CreatureEye small={type === "purple" || type === "yellow"} />
          </div>
          <span className="jaryan-mouth" aria-hidden="true" />
          {children}
        </div>
      </div>
    </div>
  );
}

function CreatureScene({ mood }) {
  return (
    <div
      className="jaryan-scene"
      data-mood={mood}
      aria-hidden="true"
    >
      <span className="jaryan-orbit orbit-one" />
      <span className="jaryan-orbit orbit-two" />
      <span className="jaryan-star star-one">✦</span>
      <span className="jaryan-star star-two">✦</span>

      <div className="jaryan-crew">
        <Creature type="purple" className="creature-purple" />
        <Creature type="black" className="creature-black" peeker />
        <Creature type="yellow" className="creature-yellow" />
        <Creature type="orange" className="creature-orange">
          <span className="jaryan-freckles">•••</span>
        </Creature>
      </div>

      <div className="jaryan-caption" aria-live="polite">
        {mood === "email" && "همه حواس‌ها به ایمیل شماست!"}
        {mood === "password-hidden" && "نگران نباشید؛ تقریباً هیچ‌کس نگاه نمی‌کند…"}
        {mood === "password-visible" && "قول می‌دهیم چیزی ندیدیم!"}
      </div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const sceneRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [email, setEmail] = useState("admin@jaryan.ir");
  const [password, setPassword] = useState("admin1234");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const mood = passwordVisible
    ? "password-visible"
    : focusedField === "email"
      ? "email"
      : focusedField === "password"
        ? "password-hidden"
        : "pointer";

  useEffect(() => () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  useEffect(() => {
    if (!focusedField && !passwordVisible) return;

    const scene = sceneRef.current?.querySelector(".jaryan-scene");
    if (!scene) return;
    [
      "--body-x",
      "--body-rotate",
      "--face-x",
      "--face-y",
      "--pupil-x",
      "--pupil-y",
      "--pupil-small-x",
      "--pupil-small-y",
    ].forEach((property) => scene.style.removeProperty(property));
  }, [focusedField, passwordVisible]);

  const trackPointer = (event) => {
    if (focusedField || passwordVisible || event.pointerType === "touch") return;

    const scene = sceneRef.current?.querySelector(".jaryan-scene");
    if (!scene) return;
    const { left, top, width, height } = scene.getBoundingClientRect();
    if (!width || !height) return;
    const x = Math.max(-1, Math.min(1, ((event.clientX - left) / width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((event.clientY - top) / height) * 2 - 1));

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(() => {
      scene.style.setProperty("--body-x", `${(x * 3).toFixed(2)}px`);
      scene.style.setProperty("--body-rotate", `${(x * 2.2).toFixed(2)}deg`);
      scene.style.setProperty("--face-x", `${(x * 5).toFixed(2)}px`);
      scene.style.setProperty("--face-y", `${(y * 3).toFixed(2)}px`);
      scene.style.setProperty("--pupil-x", `${(x * 5).toFixed(2)}px`);
      scene.style.setProperty("--pupil-y", `${(y * 6).toFixed(2)}px`);
      scene.style.setProperty("--pupil-small-x", `${(x * 2).toFixed(2)}px`);
      scene.style.setProperty("--pupil-small-y", `${(y * 3).toFixed(2)}px`);
    });
  };

  const submit = async (event) => {
    event?.preventDefault();
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      toast.success("خوش آمدید");
      nav(isAdmin(loggedInUser) ? "/admin" : "/");
    } catch (error) {
      toast.error("ایمیل یا رمز عبور نادرست است");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (demo) => {
    setEmail(demo.email);
    setPassword(demo.password);
  };

  return (
    <main className="jaryan-login-page" dir="rtl" onPointerMove={trackPointer}>
      <style>{loginStyles}</style>
      <section className="jaryan-login-card">
        <aside className="jaryan-hero">
          <div className="jaryan-brand">
            <span className="jaryan-brand-mark">ر</span>
            <span>
              <strong>روند</strong>
              <small>پلتفرم اتوماسیون فرایند</small>
            </span>
          </div>

          <div className="jaryan-copy">
            <div className="jaryan-kicker"><Sparkles size={14} /> هوشمند، ساده، سریع</div>
            <h1>فرایندهای سازمانی شما؛<br />با هوش مصنوعی، در چند ثانیه.</h1>
            <p>
              روند، ترکیب مدرنی برای سازمان‌های ایرانی است؛ با تقویم شمسی،
              رابط راست‌چین فارسی و طراحی بصری فرایند.
            </p>
          </div>

          <div ref={sceneRef} className="jaryan-scene-holder">
            <CreatureScene mood={mood} />
          </div>
        </aside>

        <div className="jaryan-form-panel">
          <div className="jaryan-mobile-brand">
            <span className="jaryan-brand-mark">ر</span>
            <strong>روند</strong>
          </div>

          <div className="jaryan-form-wrap">
            <span className="jaryan-form-spark">✦</span>
            <h2>خوش آمدید</h2>
            <p className="jaryan-form-intro">برای ادامه وارد حساب سازمانی خود شوید.</p>

            <form className="jaryan-form" onSubmit={submit}>
              <div className="jaryan-field">
                <Label htmlFor="email">ایمیل</Label>
                <Input
                  id="email"
                  data-testid="login-email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  className="jaryan-input text-left"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="name@company.com"
                  required
                />
              </div>

              <div className="jaryan-field">
                <Label htmlFor="password">رمز عبور</Label>
                <div className="jaryan-password-wrap">
                  <Input
                    id="password"
                    data-testid="login-password"
                    type={passwordVisible ? "text" : "password"}
                    dir="ltr"
                    autoComplete="current-password"
                    className="jaryan-input jaryan-password-input text-left"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    required
                  />
                  <button
                    type="button"
                    className="jaryan-password-toggle"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    aria-label={passwordVisible ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
                    aria-pressed={passwordVisible}
                  >
                    {passwordVisible ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                data-testid="login-submit"
                disabled={loading}
                className="jaryan-submit"
              >
                {loading ? "در حال ورود…" : (
                  <span className="inline-flex items-center gap-2">
                    ورود به روند
                    <ArrowLeft className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>

            <div className="jaryan-demos">
              <div className="jaryan-demo-title">
                <KeyRound size={15} /> ورود سریع با حساب‌های نمونه
              </div>
              <div className="jaryan-demo-grid">
                {DEMOS.map((demo) => (
                  <button
                    key={demo.email}
                    type="button"
                    data-testid={`demo-${demo.email.split("@")[0]}`}
                    onClick={() => fillDemo(demo)}
                  >
                    <strong>{demo.role}</strong>
                    <span dir="ltr">{demo.email}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const loginStyles = `
  .jaryan-login-page {
    --ink: #171720;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: clamp(16px, 3vw, 42px);
    background:
      radial-gradient(circle at 12% 16%, rgba(109, 94, 252, .12), transparent 24%),
      radial-gradient(circle at 90% 84%, rgba(255, 116, 71, .12), transparent 25%),
      #f5f4f7;
    color: var(--ink);
    overflow: hidden;
  }

  .jaryan-login-card {
    width: min(1120px, 100%);
    min-height: min(760px, calc(100vh - 48px));
    display: grid;
    grid-template-columns: 1.08fr .92fr;
    overflow: hidden;
    border: 1px solid rgba(23, 23, 32, .08);
    border-radius: 30px;
    background: #fff;
    box-shadow: 0 28px 80px rgba(27, 24, 48, .15);
  }

  .jaryan-hero {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: clamp(28px, 4vw, 52px);
    background: #efedf2;
    border-left: 1px solid rgba(23, 23, 32, .06);
    overflow: hidden;
  }

  .jaryan-hero::before {
    content: "";
    position: absolute;
    width: 380px;
    height: 380px;
    top: -210px;
    left: -160px;
    border: 1px solid rgba(109, 94, 252, .18);
    border-radius: 50%;
    box-shadow: 0 0 0 42px rgba(109, 94, 252, .035), 0 0 0 84px rgba(109, 94, 252, .025);
  }

  .jaryan-brand, .jaryan-mobile-brand {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .jaryan-brand-mark {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: white;
    background: var(--ink);
    font-weight: 900;
    box-shadow: 0 7px 16px rgba(23, 23, 32, .16);
  }

  .jaryan-brand strong { display: block; font-size: 17px; }
  .jaryan-brand small { display: block; margin-top: 1px; color: #74717d; font-size: 10px; }

  .jaryan-copy { position: relative; z-index: 2; margin-top: clamp(38px, 6vh, 72px); }
  .jaryan-kicker { display: flex; align-items: center; gap: 7px; color: #6758e8; font-size: 12px; font-weight: 800; }
  .jaryan-copy h1 { margin: 13px 0 0; font-size: clamp(27px, 2.8vw, 39px); line-height: 1.45; font-weight: 900; letter-spacing: -.035em; }
  .jaryan-copy p { max-width: 500px; margin: 13px 0 0; color: #6d6974; font-size: 13px; line-height: 2; }

  .jaryan-scene-holder { flex: 1; min-height: 285px; display: flex; align-items: flex-end; }
  .jaryan-scene {
    --body-x: 0px;
    --body-rotate: 0deg;
    --face-x: 0px;
    --face-y: 0px;
    --pupil-x: 0px;
    --pupil-y: 0px;
    --pupil-small-x: 0px;
    --pupil-small-y: 0px;
    position: relative;
    width: 100%;
    height: 290px;
    direction: ltr;
    isolation: isolate;
  }

  .jaryan-orbit { position: absolute; border: 1px solid rgba(23, 23, 32, .08); border-radius: 50%; }
  .orbit-one { width: 250px; height: 250px; left: 18%; bottom: -128px; }
  .orbit-two { width: 165px; height: 165px; right: -55px; top: 23px; }
  .jaryan-star { position: absolute; color: #8172ef; animation: jaryan-float 3.8s ease-in-out infinite; }
  .star-one { left: 8%; top: 62px; font-size: 20px; }
  .star-two { right: 5%; top: 125px; color: #fb7150; font-size: 13px; animation-delay: -1.5s; }

  .jaryan-crew { position: absolute; inset: 0; }
  .jaryan-creature-wrap { position: absolute; bottom: 42px; transform-origin: 50% 100%; animation: jaryan-arrive .75s cubic-bezier(.2,.8,.2,1) both; }
  .jaryan-creature {
    --skin: #171720;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--skin);
    box-shadow: 0 14px 26px rgba(28, 26, 35, .15);
    transform-origin: 50% 100%;
    transform: translateX(var(--body-x)) rotate(var(--body-rotate));
    transition: transform .32s cubic-bezier(.2,.8,.2,1);
  }

  .jaryan-face {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translate(var(--face-x), var(--face-y));
    transition: transform .28s cubic-bezier(.2,.8,.2,1);
  }

  .jaryan-eyes { display: flex; gap: 6px; }
  .jaryan-eye { position: relative; width: 25px; height: 29px; overflow: hidden; border-radius: 50%; background: #fff; box-shadow: inset 0 -2px 3px rgba(0,0,0,.08); }
  .jaryan-eye.is-small { width: 12px; height: 16px; }
  .jaryan-pupil { position: absolute; z-index: 1; width: 9px; height: 11px; left: 50%; top: 50%; border-radius: 50%; background: #171720; transform: translate(calc(-50% + var(--pupil-x)), calc(-50% + var(--pupil-y))); transition: transform .18s ease, opacity .15s ease; }
  .is-small .jaryan-pupil { width: 5px; height: 7px; transform: translate(calc(-50% + var(--pupil-small-x)), calc(-50% + var(--pupil-small-y))); }
  .jaryan-lid { position: absolute; z-index: 2; inset: -1px; border-radius: 50%; background: var(--skin); transform: translateY(-105%); animation: jaryan-blink 6.5s infinite; transition: transform .22s ease; }
  .jaryan-mouth { width: 26px; height: 9px; margin-top: 14px; border-bottom: 3px solid rgba(23,23,32,.75); border-radius: 50%; transition: all .25s ease; }

  .creature-purple { left: 17%; width: 72px; height: 176px; z-index: 1; transform: rotate(-8deg); animation-delay: .08s; }
  .purple { --skin: #7457f5; border-radius: 15px 15px 7px 7px; }
  .purple::before { content: ""; position: absolute; inset: 0 0 auto; height: 10px; background: #cfc4ff; }
  .purple .jaryan-face { top: 52px; left: 19px; }
  .purple .jaryan-mouth { width: 18px; border-color: rgba(23,23,32,.7); }

  .creature-black { left: 34%; width: 76px; height: 142px; z-index: 3; transform: rotate(3deg); animation-delay: .16s; }
  .black { --skin: #1b1b24; border-radius: 10px 10px 6px 6px; }
  .black .jaryan-face { top: 30px; left: 12px; }
  .black .jaryan-mouth { border-color: rgba(255,255,255,.5); }

  .creature-yellow { left: 53%; width: 90px; height: 112px; z-index: 2; transform: rotate(4deg); animation-delay: .24s; }
  .yellow { --skin: #f7cb2d; border-radius: 50px 50px 6px 6px; }
  .yellow .jaryan-face { top: 30px; left: 23px; }
  .yellow .jaryan-mouth { width: 36px; margin-top: 13px; border: 0; border-top: 4px solid rgba(23,23,32,.82); border-radius: 4px; }

  .creature-orange { left: 5%; width: 178px; height: 103px; z-index: 4; animation-delay: .3s; }
  .orange { --skin: #ff754b; border-radius: 95px 95px 5px 5px; }
  .orange .jaryan-face { top: 31px; left: 57px; }
  .orange .jaryan-eyes { gap: 14px; }
  .orange .jaryan-eye { width: 15px; height: 17px; background: transparent; box-shadow: none; }
  .orange .jaryan-pupil { display: block; width: 8px; height: 9px; }
  .orange .jaryan-mouth { display: none; }
  .jaryan-freckles { margin-top: 7px; color: #24222a; font-size: 17px; letter-spacing: 4px; line-height: .5; }

  .jaryan-caption { position: absolute; left: 0; right: 0; bottom: 2px; min-height: 25px; color: #6d6974; font-size: 11px; font-weight: 700; text-align: center; direction: rtl; }

  .jaryan-scene[data-mood="email"] { --face-x: -5px; --face-y: 2px; --pupil-x: -5px; --pupil-y: 4px; --pupil-small-x: -2px; --pupil-small-y: 2px; }
  .jaryan-scene[data-mood="password-hidden"] { --face-x: 5px; --face-y: 1px; --pupil-x: 5px; --pupil-y: 2px; --pupil-small-x: 2px; --pupil-small-y: 1px; }
  .jaryan-scene[data-mood="password-visible"] { --face-x: 5px; --face-y: 1px; --pupil-x: 5px; --pupil-y: 2px; --pupil-small-x: 2px; --pupil-small-y: 1px; }
  .jaryan-scene[data-mood="email"] .jaryan-creature { transform: translateX(-4px) rotate(-3deg); }
  .jaryan-scene[data-mood="password-hidden"] .jaryan-creature,
  .jaryan-scene[data-mood="password-visible"] .jaryan-creature { transform: translateX(5px) rotate(5deg); }
  .jaryan-scene[data-mood="password-hidden"] .is-peeker { --pupil-x: -5px; --pupil-y: 5px; --pupil-small-x: -2px; --pupil-small-y: 2px; transform: translateX(-3px) rotate(-4deg); }
  .jaryan-scene[data-mood="password-hidden"] .is-peeker .jaryan-face { transform: translate(-5px, 3px); }
  .jaryan-scene[data-mood="password-visible"] .jaryan-lid { animation: none; transform: translateY(0); }
  .jaryan-scene[data-mood="password-visible"] .jaryan-pupil { opacity: 0; }
  .jaryan-scene[data-mood="password-visible"] .jaryan-mouth { width: 21px; height: 0; border-radius: 0; }

  .jaryan-form-panel { display: flex; align-items: center; justify-content: center; padding: clamp(28px, 5vw, 70px); background: #fff; }
  .jaryan-form-wrap { position: relative; width: 100%; max-width: 390px; }
  .jaryan-mobile-brand { display: none; }
  .jaryan-form-spark { position: absolute; top: -33px; left: 0; font-size: 24px; }
  .jaryan-form-wrap h2 { margin: 0; font-size: 30px; font-weight: 900; letter-spacing: -.025em; }
  .jaryan-form-intro { margin: 7px 0 0; color: #77737d; font-size: 13px; }
  .jaryan-form { margin-top: 34px; display: grid; gap: 20px; }
  .jaryan-field { display: grid; gap: 8px; }
  .jaryan-field label { color: #393640; font-size: 12px; font-weight: 800; }
  .jaryan-input { height: 49px !important; border: 1px solid #dedbe3 !important; border-radius: 12px !important; background: #faf9fb !important; box-shadow: none !important; transition: border-color .2s ease, background .2s ease, box-shadow .2s ease !important; }
  .jaryan-input:focus { border-color: #7263ed !important; background: #fff !important; box-shadow: 0 0 0 4px rgba(114,99,237,.1) !important; }
  .jaryan-password-wrap { position: relative; direction: ltr; }
  .jaryan-password-input { padding-right: 45px !important; }
  .jaryan-password-toggle { position: absolute; top: 50%; right: 12px; display: grid; place-items: center; padding: 5px; border: 0; border-radius: 7px; background: transparent; color: #75717d; transform: translateY(-50%); cursor: pointer; }
  .jaryan-password-toggle:hover { color: #171720; background: #efedf2; }
  .jaryan-password-toggle:focus-visible { outline: 2px solid #7263ed; outline-offset: 2px; }
  .jaryan-submit { width: 100%; height: 50px; margin-top: 3px; border-radius: 13px !important; background: #171720 !important; color: #fff !important; font-weight: 800 !important; box-shadow: 0 10px 24px rgba(23,23,32,.18) !important; transition: transform .18s ease, box-shadow .18s ease !important; }
  .jaryan-submit:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(23,23,32,.22) !important; }
  .jaryan-submit:active { transform: translateY(1px) scale(.995); }

  .jaryan-demos { margin-top: 34px; padding-top: 23px; border-top: 1px solid #ece9ef; }
  .jaryan-demo-title { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; color: #77737d; font-size: 11px; }
  .jaryan-demo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .jaryan-demo-grid button { padding: 10px 11px; border: 1px solid #e2dfe6; border-radius: 11px; background: #fff; text-align: right; cursor: pointer; transition: border-color .18s ease, background .18s ease, transform .18s ease; }
  .jaryan-demo-grid button:hover { border-color: #b9b1f8; background: #f8f7ff; transform: translateY(-1px); }
  .jaryan-demo-grid strong { display: block; color: #393640; font-size: 11px; }
  .jaryan-demo-grid span { display: block; margin-top: 3px; color: #85818b; font-family: 'JetBrains Mono', monospace; font-size: 9px; }

  @keyframes jaryan-arrive { from { opacity: 0; translate: 0 20px; } to { opacity: 1; translate: 0 0; } }
  @keyframes jaryan-float { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-8px) rotate(12deg); } }
  @keyframes jaryan-blink { 0%, 43%, 47%, 100% { transform: translateY(-105%); } 44%, 46% { transform: translateY(0); } }

  @media (max-width: 860px) {
    .jaryan-login-page { padding: 0; overflow: auto; background: #fff; }
    .jaryan-login-card { min-height: 100vh; grid-template-columns: 1fr; border: 0; border-radius: 0; box-shadow: none; }
    .jaryan-hero { min-height: 190px; padding: 25px 24px 30px; border: 0; }
    .jaryan-brand { display: none; }
    .jaryan-copy { margin-top: 3px; }
    .jaryan-copy h1 { margin-top: 8px; font-size: 25px; line-height: 1.42; }
    .jaryan-copy p { display: none; }
    .jaryan-kicker { font-size: 10px; }
    .jaryan-scene-holder { display: none; }
    .jaryan-form-panel { display: block; padding: 28px 24px 44px; }
    .jaryan-mobile-brand { display: flex; margin-bottom: 36px; }
    .jaryan-form-wrap { max-width: 520px; margin: auto; }
    .jaryan-form-spark { top: -6px; }
  }

  @media (max-width: 430px) {
    .jaryan-demo-grid { grid-template-columns: 1fr; }
  }

  @media (prefers-reduced-motion: reduce) {
    .jaryan-creature-wrap, .jaryan-star, .jaryan-lid { animation: none !important; }
    .jaryan-creature, .jaryan-face, .jaryan-pupil { transition-duration: .01ms !important; }
  }
`;
