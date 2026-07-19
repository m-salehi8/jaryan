import { useEffect, useState } from "react";
import {
  BarChart2, Users, FileText, TrendingUp, Clock, AlertCircle
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toFaNumber } from "@/lib/jalali";

const STATUS_PIE = {
  pending:     { label: "در انتظار",   color: "#f59e0b" },
  in_progress: { label: "در حال انجام", color: "#3b82f6" },
  approved:    { label: "تایید شده",   color: "#10b981" },
  rejected:    { label: "رد شده",      color: "#ef4444" },
  done:        { label: "انجام شده",   color: "#737373" },
};

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return "داده کافی ندارد";
  if (minutes < 60) return `${toFaNumber(Math.round(minutes))} دقیقه`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${toFaNumber(h)} ساعت و ${toFaNumber(m)} دقیقه`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.round((minutes % 1440) / 60);
  return `${toFaNumber(d)} روز و ${toFaNumber(h)} ساعت`;
}

// -----------------------------
// TAB 1: General Analytics (Overview)
// -----------------------------
function GeneralAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/analytics/dashboard")
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-64 animate-pulse bg-neutral-100 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> خطا در بارگذاری آمار تحلیلی عمومی
        </div>
      </div>
    );
  }

  const pieData = Object.entries(data.task_status_dist || {}).map(([k, v]) => ({
    name: (STATUS_PIE[k] || { label: k }).label,
    value: v,
    color: (STATUS_PIE[k] || { color: "#ccc" }).color,
  }));
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="mt-6 space-y-4">
      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-sm font-semibold text-neutral-900 mb-1">فرایندهای راه‌اندازی‌شده</div>
          <div className="text-[11px] text-neutral-400 mb-4">به تفکیک روز شمسی</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.daily_processes} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#737373" }}
                tickFormatter={(d) => {
                  const p = String(d).split("-");
                  return toFaNumber(`${p[1]}/${p[2]}`);
                }}
                interval={4}
              />
              <YAxis tick={{ fontSize: 10, fill: "#737373" }} allowDecimals={false} />
              <RechartsTooltip
                contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                labelFormatter={(d) => toFaNumber(d)}
                formatter={(v) => [toFaNumber(v), "فرایند"]}
              />
              <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-sm font-semibold text-neutral-900 mb-1">توزیع وضعیت تسک‌ها</div>
          <div className="text-[11px] text-neutral-400 mb-4">کل تسک‌های سازمان</div>
          {pieTotal === 0 ? (
            <div className="h-[220px] grid place-items-center text-sm text-neutral-400">داده‌ای موجود نیست</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                  formatter={(v, n) => [toFaNumber(v), n]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Cards row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-sm font-semibold text-neutral-900 mb-4">پرکارترین کاربران</div>
          {(!data.top_users || data.top_users.length === 0) ? (
            <div className="text-sm text-neutral-400 py-4 text-center">داده‌ای موجود نیست</div>
          ) : (
            <ul className="space-y-3">
              {data.top_users.map((u) => (
                <li key={u.user_id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full grid place-items-center text-white text-xs font-medium bg-brand">
                    {(u.full_name || "؟")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 truncate">{u.full_name}</div>
                    <div className="text-[11px] text-neutral-500">{u.role || "—"}</div>
                  </div>
                  <div className="text-sm font-bold text-neutral-900 fa-nums">{toFaNumber(u.task_count)} تسک</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-neutral-500">
            <Clock className="w-4 h-4" />
            <span className="text-[11px]">میانگین زمان تکمیل فرایند</span>
          </div>
          <div className="mt-3 text-3xl font-bold text-neutral-900">
            {formatDuration(data.avg_completion_minutes)}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">بر اساس فرایندهای تکمیل‌شده در ۳۰ روز گذشته</div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// TAB 2: Personnel Analytics
// -----------------------------
function PersonnelAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/analytics/users")
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-64 animate-pulse bg-neutral-100 rounded-xl mt-6" />;
  }

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" /> خطا در دریافت عملکرد پرسنل
      </div>
    );
  }

  const sortedByTime = [...data].sort((a, b) => b.avg_lead_time - a.avg_lead_time).slice(0, 10);

  return (
    <div className="mt-6 space-y-4">
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="text-sm font-semibold text-neutral-900 mb-1">میانگین زمان انجام تسک (Lead Time)</div>
        <div className="text-[11px] text-neutral-400 mb-6">۱۰ کاربر با طولانی‌ترین زمان انجام تسک (دقیقه)</div>
        
        {sortedByTime.length === 0 ? (
          <div className="py-10 text-center text-neutral-400 text-sm">داده‌ای برای نمایش وجود ندارد.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sortedByTime} layout="vertical" margin={{ top: 5, right: 10, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={toFaNumber} />
              <YAxis 
                type="category" 
                dataKey="full_name" 
                tick={{ fontSize: 11, fill: "#374151" }} 
                width={120} 
              />
              <RechartsTooltip 
                contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                formatter={(v) => [toFaNumber(v) + " دقیقه", "میانگین زمان"]}
              />
              <Bar dataKey="avg_lead_time" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-0 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
            <tr>
              <th className="px-5 py-3 font-medium">نام کاربر</th>
              <th className="px-5 py-3 font-medium">نقش سازمانی</th>
              <th className="px-5 py-3 font-medium">کل تسک‌های انجام‌شده</th>
              <th className="px-5 py-3 font-medium">میانگین زمان هر تسک</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {data.map(user => (
              <tr key={user.user_id} className="hover:bg-neutral-50/50">
                <td className="px-5 py-3 font-medium text-neutral-900">{user.full_name}</td>
                <td className="px-5 py-3 text-neutral-500">{user.role}</td>
                <td className="px-5 py-3 text-neutral-900 fa-nums">{toFaNumber(user.task_count)}</td>
                <td className="px-5 py-3 text-neutral-500 fa-nums">{formatDuration(user.avg_lead_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -----------------------------
// TAB 3: Form Data Analytics
// -----------------------------
function FormDataAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/analytics/forms")
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-64 animate-pulse bg-neutral-100 rounded-xl mt-6" />;
  }

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" /> خطا در دریافت گزارش‌های فرمی
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="text-sm font-semibold text-neutral-900 mb-1">تعداد نمونه‌های اجرا شده از هر فرایند</div>
        <div className="text-[11px] text-neutral-400 mb-6">این بخش در آینده می‌تواند برای استخراج دیتای دقیق فیلدها استفاده شود.</div>
        
        {data.length === 0 ? (
          <div className="py-10 text-center text-neutral-400 text-sm">داده‌ای برای نمایش وجود ندارد.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: "#737373" }} 
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={toFaNumber} />
              <RechartsTooltip 
                contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                formatter={(v) => [toFaNumber(v), "تعداد"]}
              />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// -----------------------------
// MAIN PAGE EXPORT
// -----------------------------
export default function Analytics() {
  return (
    <div className="p-6 lg:p-10 max-w-[1400px] mx-auto animate-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2 tracking-tight">
          <BarChart2 className="w-6 h-6 text-brand" />
          گزارش‌ها و تحلیل‌ها
        </h1>
        <p className="text-sm text-neutral-500 mt-2">
          تحلیل عملکرد سازمان، گلوگاه‌ها و دیتای فرایندها
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-white border border-neutral-200 h-auto p-1 rounded-lg inline-flex">
          <TabsTrigger value="overview" className="flex items-center gap-2 py-2 px-4 rounded-md data-[state=active]:bg-brand data-[state=active]:text-white">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-medium">گزارش‌های عمومی</span>
          </TabsTrigger>
          <TabsTrigger value="personnel" className="flex items-center gap-2 py-2 px-4 rounded-md data-[state=active]:bg-brand data-[state=active]:text-white">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">عملکرد پرسنل</span>
          </TabsTrigger>
          <TabsTrigger value="forms" className="flex items-center gap-2 py-2 px-4 rounded-md data-[state=active]:bg-brand data-[state=active]:text-white">
            <FileText className="w-4 h-4" />
            <span className="text-sm font-medium">گزارش‌های فرمی</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <GeneralAnalytics />
        </TabsContent>
        <TabsContent value="personnel">
          <PersonnelAnalytics />
        </TabsContent>
        <TabsContent value="forms">
          <FormDataAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
