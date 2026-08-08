#!/usr/bin/env python3
"""
Generate a realistic 3-month operational dataset for Jaryan workflow platform.
Company: شرکت فناوران جریان (Fanaavaran-e-Jaryan) - a mid-sized Iranian tech company (≈150 employees).

Assumptions:
- Iran work week: Sat-Wed full day, Thu half-day (until 13:00), Fri closed
- Peak usage hours: 8:30-10:30 (morning surge), 14:00-16:30 (afternoon surge)
- Month 1 = adoption phase (lighter, more exploratory usage)
- Month 2 = growth phase (more processes, more users onboarded)
- Month 3 = steady-state (plateau at expected daily volume)
- Approval rate ≈ 85% approved, 10% rejected, 5% auto-cancelled/stuck
- Response time degradation with load (more processes → slower responses)
- Error rate ≈ 3-5% total (network, validation, system errors)
- Hourly patterns follow realistic human behavior
"""

import json, csv, random, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

random.seed(42)

# ─── Constants ───────────────────────────────────────────────────────────────

NOW = datetime.now(timezone.utc)
MONTHS_AGO = NOW - timedelta(days=90)

ORG_ID = "org_fanaavaran"

# Iran work week: 0=Monday ... 6=Sunday → we map to Persian week
# Persian week: Sat(0), Sun(1), Mon(2), Tue(3), Wed(4), Thu(5), Fri(6)
# In Python weekday(): Mon=0 ... Sun=6
PERSIAN_WEEKDAY = {0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 0, 6: 1}
# Full workdays: Persian Sat-Wed (Python Mon-Fri with offset), half-day Thu (Python Sat), off Fri (Python Sun)

def is_work_day(dt):
    """Return (is_full_day, is_half_day, is_off)."""
    py_wd = dt.weekday()
    persian_wd = PERSIAN_WEEKDAY[py_wd]
    if persian_wd == 6:   # Friday
        return False, False, True
    if persian_wd == 5:   # Thursday
        return False, True, False
    return True, False, False

def hours_worked(dt):
    """Return working hours weight for a given datetime (0.0 = off, 0.5 = half-day, 1.0 = full)."""
    full, half, off = is_work_day(dt)
    if off:
        return 0.0
    if half:
        h = dt.hour + dt.minute / 60
        return 1.0 if h < 13 else 0.0  # only until 13:00 on Thursday
    h = dt.hour + dt.minute / 60
    if h < 7.5 or h >= 18:
        return 0.0
    if 12 <= h < 13.5:
        return 0.3   # lunch dip
    if 7.5 <= h < 9:
        return 0.6 + (h-7.5)/1.5*0.4  # ramp-up
    if 9 <= h < 11:
        return 1.0   # peak morning
    if 11 <= h < 12:
        return 0.8   # pre-lunch
    if 13.5 <= h < 15:
        return 0.5 + (h-13.5)/1.5*0.5  # post-lunch ramp
    if 15 <= h < 17:
        return 1.0   # peak afternoon
    return 0.7   # wind-down

def random_work_time(base_date, hour_bias=10):
    """Pick a random time within working hours on a given date."""
    full, half, off = is_work_day(base_date)
    if off:
        # Maybe some overtime on Friday (rare)
        if random.random() < 0.05:
            return base_date.replace(hour=random.randint(10, 14), minute=random.randint(0, 59))
        return None
    
    if half:
        max_h = 13
    else:
        max_h = 18
    
    # Weight toward peak hours
    hour_range = list(range(8, max_h))
    if len(hour_range) <= 3:
        weights = [1.0] * len(hour_range)
    elif half:
        weights = [0.3, 1.0, 0.8, 0.5, 0.2][:len(hour_range)]
    else:
        weights = [0.3, 1.0, 0.8, 0.5, 0.2, 0.5, 1.0, 0.8, 0.5, 0.3][:len(hour_range)]
    h = random.choices(hour_range, weights=weights, k=1)[0]
    m = random.randint(0, 59)
    return base_date.replace(hour=h, minute=m)

# ─── Departments ─────────────────────────────────────────────────────────────

DEPARTMENTS = [
    {"id": "dept_hr",     "name": "منابع انسانی",      "slug": "hr"},
    {"id": "dept_it",     "name": "فناوری اطلاعات",     "slug": "it"},
    {"id": "dept_finance","name": "مالی",              "slug": "finance"},
    {"id": "dept_ops",    "name": "عملیات",            "slug": "ops"},
]

# ─── Users ───────────────────────────────────────────────────────────────────

USERS = [
    # Admin
    {"id": "u_admin",  "email": "admin@jaryan.ir",      "name": "آرش رضایی",       "role": "مدیر", "dept": "dept_it",      "color": "#171717"},
    # Designers
    {"id": "u_des1",   "email": "designer1@jaryan.ir",  "name": "نگار محمدی",      "role": "مدیر",  "dept": "dept_it",      "color": "#525252"},
    {"id": "u_des2",   "email": "designer2@jaryan.ir",  "name": "سینا کرمی",       "role": "مدیر",  "dept": "dept_ops",     "color": "#4a4a4a"},
    # Managers
    {"id": "u_mgr_hr","email": "hr.manager@jaryan.ir",  "name": "زهرا حیدری",      "role": "مدیر",     "dept": "dept_hr",      "color": "#737373"},
    {"id": "u_mgr_it","email": "it.manager@jaryan.ir",  "name": "حسین کریمی",      "role": "مدیر",     "dept": "dept_it",      "color": "#6b6b6b"},
    {"id": "u_mgr_fin","email": "finance.manager@jaryan.ir", "name": "مریم سعیدی", "role": "مدیر",     "dept": "dept_finance", "color": "#8a8a8a"},
    {"id": "u_mgr_ops","email": "ops.manager@jaryan.ir", "name": "علی طاهری",       "role": "مدیر",     "dept": "dept_ops",     "color": "#9a9a9a"},
    # Employees
    {"id": "u_emp1",   "email": "emp1@jaryan.ir",       "name": "سارا احمدی",      "role": "کارمند",       "dept": "dept_hr",      "color": "#a3a3a3"},
    {"id": "u_emp2",   "email": "emp2@jaryan.ir",       "name": "رضا رحمانی",      "role": "کارمند",       "dept": "dept_it",      "color": "#b3b3b3"},
    {"id": "u_emp3",   "email": "emp3@jaryan.ir",       "name": "مینا قاسمی",      "role": "کارمند",       "dept": "dept_finance", "color": "#c3c3c3"},
    {"id": "u_emp4",   "email": "emp4@jaryan.ir",       "name": "پویا نجفی",       "role": "کارمند",       "dept": "dept_ops",     "color": "#d3d3d3"},
    {"id": "u_emp5",   "email": "emp5@jaryan.ir",       "name": "زهرا موسوی",      "role": "کارمند",       "dept": "dept_hr",      "color": "#e3e3e3"},
    {"id": "u_emp6",   "email": "emp6@jaryan.ir",       "name": "امید راد",        "role": "کارمند",       "dept": "dept_it",      "color": "#9a9a9a"},
    {"id": "u_emp7",   "email": "emp7@jaryan.ir",       "name": "ندا شفیعی",       "role": "کارمند",       "dept": "dept_finance", "color": "#8f8f8f"},
    {"id": "u_emp8",   "email": "emp8@jaryan.ir",       "name": "محمد امین",       "role": "کارمند",       "dept": "dept_ops",     "color": "#7f7f7f"},
]

USER_MAP = {u["id"]: u for u in USERS}
DEPARTMENT_EMPLOYEES = {}
for u in USERS:
    DEPARTMENT_EMPLOYEES.setdefault(u["dept"], []).append(u["id"])

# Managers by dept
MANAGERS = {"dept_hr": "u_mgr_hr", "dept_it": "u_mgr_it", "dept_finance": "u_mgr_fin", "dept_ops": "u_mgr_ops"}

# ─── Workflows ───────────────────────────────────────────────────────────────

def make_node(nid, ntype, label, **kw):
    return {"id": nid, "type": ntype, "label": label, "position": kw.pop("position", {"x": 0, "y": 0}), "data": kw.pop("data", {})}

def make_edge(eid, src, tgt, **kw):
    return {"id": eid, "source": src, "target": tgt, **kw}

WORKFLOWS = [
    {
        "id": "wf_leave",
        "name": "درخواست مرخصی",
        "description": "ثبت و تایید مرخصی کارکنان با زنجیره تایید بر اساس مدت",
        "nodes": [
            make_node("n1", "trigger", "شروع: ثبت درخواست"),
            make_node("n2", "form", "تکمیل فرم مرخصی", data={"form_id": "form_leave", "assignee_role": "کارمند"}),
            make_node("n3", "approval", "تایید مدیر تیم", data={"assignee_role": "مدیر"}),
            make_node("n4", "condition", "بیش از ۳ روز؟", data={"expression": "duration > 3"}),
            make_node("n5", "approval", "تایید ادمین سازمان", data={"assignee_role": "مدیر"}),
            make_node("n6", "end", "اعلام نتیجه"),
        ],
        "edges": [
            make_edge("e1", "n1", "n2"),
            make_edge("e2", "n2", "n3"),
            make_edge("e3", "n3", "n4"),
            make_edge("e4", "n4", "n5", label="بله", condition={"field_id": "_task_status", "op": "=", "value": "approved"}),
            make_edge("e5", "n4", "n6", label="خیر"),
            make_edge("e6", "n5", "n6"),
        ],
    },
    {
        "id": "wf_petty",
        "name": "تنخواه‌گردان",
        "description": "درخواست و تصویب تنخواه با مسیر تایید دوگانه بر اساس مبلغ",
        "nodes": [
            make_node("n1", "trigger", "ثبت درخواست تنخواه"),
            make_node("n2", "form", "تکمیل فرم تنخواه", data={"form_id": "form_petty", "assignee_role": "کارمند"}),
            make_node("n3", "approval", "تایید مدیر", data={"assignee_role": "مدیر"}),
            make_node("n4", "approval", "تایید مالی (مبالغ بالا)", data={"assignee_role": "مدیر"}),
            make_node("n5", "task", "پرداخت", data={"assignee_role": "مدیر"}),
            make_node("n6", "end", "پایان"),
        ],
        "edges": [
            make_edge("e1", "n1", "n2"),
            make_edge("e2", "n2", "n3"),
            make_edge("e3", "n3", "n4", label="مبلغ>۵میلیون", condition={"field_id": "amount", "op": ">", "value": "5000000"}),
            make_edge("e4", "n3", "n5", label="مبلغ عادی"),
            make_edge("e5", "n4", "n5"),
            make_edge("e6", "n5", "n6"),
        ],
    },
    {
        "id": "wf_hire",
        "name": "جذب و استخدام",
        "description": "فرایند جذب، مصاحبه و صدور قرارداد نیروی جدید",
        "nodes": [
            make_node("n1", "trigger", "شروع فرایند استخدام"),
            make_node("n2", "form", "تکمیل فرم درخواست استخدام", data={"form_id": "form_hire", "assignee_role": "مدیر"}),
            make_node("n3", "approval", "بررسی و تایید منابع انسانی", data={"assignee_role": "مدیر"}),
            make_node("n4", "condition", "نتیجه بررسی"),
            make_node("n5", "task", "تنظیم قرارداد و آنبوردینگ", data={"assignee_role": "کارمند"}),
            make_node("n6", "end", "استخدام موفق"),
            make_node("n7", "end", "رد درخواست"),
        ],
        "edges": [
            make_edge("e1", "n1", "n2"),
            make_edge("e2", "n2", "n3"),
            make_edge("e3", "n3", "n4"),
            make_edge("e4", "n4", "n5", label="تایید", condition={"field_id": "_task_status", "op": "=", "value": "approved"}),
            make_edge("e5", "n4", "n7", label="رد", condition={"field_id": "_task_status", "op": "=", "value": "rejected"}),
            make_edge("e6", "n5", "n6"),
        ],
    },
    {
        "id": "wf_it",
        "name": "پشتیبانی فناوری اطلاعات",
        "description": "ثبت و پیگیری درخواست‌های پشتیبانی فناوری اطلاعات",
        "nodes": [
            make_node("n1", "trigger", "ثبت تیکت پشتیبانی"),
            make_node("n2", "form", "ثبت شرح مشکل", data={"form_id": "form_it", "assignee_role": "کارمند"}),
            make_node("n3", "task", "بررسی و رفع مشکل", data={"assignee_role": "مدیر"}),
            make_node("n4", "approval", "تایید کاربر (پایان کار)", data={"assignee_role": "کارمند"}),
            make_node("n5", "end", "تیکت بسته شد"),
        ],
        "edges": [
            make_edge("e1", "n1", "n2"),
            make_edge("e2", "n2", "n3"),
            make_edge("e3", "n3", "n4"),
            make_edge("e4", "n4", "n5"),
        ],
    },
]

WORKFLOW_MAP = {w["id"]: w for w in WORKFLOWS}


# ─── Generation ──────────────────────────────────────────────────────────────

def is_valid_process_time(dt):
    """A process can only be created during work hours (or within 1h on Thu, rare overtime on Fri)."""
    full, half, off = is_work_day(dt)
    if off:
        return random.random() < 0.03  # rare weekend/overtime
    if half:
        return dt.hour < 14  # Thu until 13:00
    h = dt.hour + dt.minute/60
    return 7.5 <= h <= 18.5


def generate_datasets():
    # ── Process Instances ─────────────────────────────────────────────────
    processes = []
    tasks = []
    activities = []
    comments = []
    chat_sessions = []
    chat_messages_list = []
    system_events = []
    
    process_id_counter = 0
    task_id_counter = 0

    def next_pid():
        nonlocal process_id_counter
        process_id_counter += 1
        return f"proc_{process_id_counter:04d}"
    
    def next_tid():
        nonlocal task_id_counter
        task_id_counter += 1
        return f"task_{task_id_counter:04d}"

    # Daily volume model: starts ~8/day month1 → ~12/day month2 → ~15/day month3
    # With Thu half-day, Fri ~0
    current = MONTHS_AGO.replace(hour=8, minute=0, second=0, microsecond=0) + timedelta(days=1)
    while current < NOW:
        days_in = (current - MONTHS_AGO).days
        
        # Determine daily volume based on month
        if days_in < 30:
            day_target = random.randint(4, 10)  # Month 1: 4-10/day
        elif days_in < 60:
            day_target = random.randint(7, 14)  # Month 2: 7-14/day
        else:
            day_target = random.randint(10, 18) # Month 3: 10-18/day
        
        # Scale by day of week
        full, half, off = is_work_day(current)
        if off:
            day_target = max(0, int(day_target * 0.02))  # ~0 on Fri
        elif half:
            day_target = max(1, int(day_target * 0.4))   # ~40% on Thu
        
        # Workflow mix (IT support has most volume, hiring least)
        for _ in range(day_target):
            p_time = random_work_time(current)
            if p_time is None:
                continue
            if not is_valid_process_time(p_time):
                continue
            
            # Workflow selection with realistic distribution
            wf_weights = {"wf_it": 0.40, "wf_leave": 0.30, "wf_petty": 0.20, "wf_hire": 0.10}
            wf_id = random.choices(
                list(wf_weights.keys()), weights=list(wf_weights.values()), k=1
            )[0]
            wf = WORKFLOW_MAP[wf_id]
            
            # Pick starter (employees mostly, managers sometimes)
            if random.random() < 0.1:
                starter_id = random.choice([u["id"] for u in USERS if u["role"] in ("مدیر", "مدیر")])
            else:
                starter_id = random.choice([u["id"] for u in USERS if u["role"] == "کارمند"])
            
            starter = USER_MAP[starter_id]
            
            # Process outcome
            outcome_weights = {"completed": 0.78, "rejected": 0.12, "in_progress": 0.08, "stuck": 0.02}
            outcome = random.choices(list(outcome_weights.keys()), weights=list(outcome_weights.values()), k=1)[0]
            
            pid = next_pid()
            
            # Form data depending on workflow
            form_data = {}
            if wf_id == "wf_leave":
                duration = random.randint(1, 10)
                form_data = {
                    "leave_type": random.choice(["استحقاقی", "استحقاقی", "استحقاقی", "استعلاجی", "بدون حقوق"]),
                    "start_date": (p_time + timedelta(days=random.randint(1, 14))).strftime("%Y-%m-%d"),
                    "end_date": (p_time + timedelta(days=random.randint(1, 14) + duration)).strftime("%Y-%m-%d"),
                    "duration": duration,
                    "reason": random.choice([
                        "مرخصی استعلاجی", "کارهای شخصی", "مسافرت", "امتحان دانشگاه",
                        "تعمیرات منزل", "مرخصی ساعتی برای پزشک", "نیازی به ذکر نیست"
                    ]),
                }
            elif wf_id == "wf_petty":
                amount = random.choice([500000, 1000000, 2000000, 3000000, 4000000, 7000000, 10000000, 15000000])
                form_data = {
                    "title": random.choice(["خرید لوازم التحریر", "هزینه پذیرایی", "کرایه تاکسی", "اینترنت همراه", "تعمیرات جزئی"]),
                    "amount": amount,
                    "description": random.choice(["برای مصارف جاری اداری", "برای جلسه با مشتری", "هزینه ایاب و ذهاب"]),
                }
            elif wf_id == "wf_hire":
                form_data = {
                    "candidate_name": random.choice([
                        "امیرحسین محمدی", "فاطمه حسینی", "محمد رضایی", "زهرا کاظمی",
                        "علی مرادی", "نرگس صادقی", "سعید اکبری", "الناز جعفری"
                    ]),
                    "position": random.choice([
                        "توسعه‌دهنده ارشد بک‌اند", "مهندس DevOps", "تحلیلگر داده",
                        "کارشناس فروش", "کارشناس منابع انسانی", "طراح UI/UX"
                    ]),
                    "department": random.choice(["فنی و مهندسی", "منابع انسانی", "فروش و بازاریابی", "مالی"]),
                    "proposed_salary": random.choice([15000000, 20000000, 25000000, 30000000, 40000000]),
                    "evaluation": random.choice(["بسیار خوب", "خوب", "نیازمند آموزش"]),
                }
            elif wf_id == "wf_it":
                # Ensure category matches the title for realism
                cat_weights = {"سخت‌افزار": 0.35, "نرم‌افزار": 0.30, "شبکه": 0.20, "سایر": 0.15}
                category = random.choices(list(cat_weights.keys()), weights=list(cat_weights.values()), k=1)[0]
                title_opts = {
                    "سخت‌افزار": ["سیستم هنگ کرده", "پرینتر کار نمی‌کند", "شارژ لپتاپ", "صفحه نمایش مشکل دارد", "کیبورد خراب شده"],
                    "نرم‌افزار": ["مشکل ایمیل", "نصب نرم‌افزار", "خطا در اکسل", "آنتی‌ویروس آپدیت نمی‌شود", "مشکل در نرم‌افزار حسابداری"],
                    "شبکه": ["مشکل اینترنت", "مشکل در وای فای", "دسترسی به سرور", "VPN وصل نمی‌شود", "قطع و وصل شدن شبکه"],
                    "سایر": ["مشکل UPS", "دسترسی به دیتابیس", "تنظیمات کاربری", "گزارش خرابی تجهیزات"],
                }
                title = random.choice(title_opts[category])
                form_data = {
                    "category": category,
                    "title": title,
                    "description": f"شرح کامل مشکل {title} توسط کاربر ثبت شده است.",
                }
            
            # Determine process paths and timing
            start_time = p_time
            process_status = outcome
            completed_nodes = []  # will track only user-actionable completed nodes
            
            # Simulate path through workflow
            path = []
            node_map = {n["id"]: n for n in wf["nodes"]}
            edge_map = {}
            for e in wf["edges"]:
                edge_map.setdefault(e["source"], []).append(e)
            
            current_node_id = wf["nodes"][0]["id"]
            dead_end = False
            last_task_time = start_time
            visited_nodes = set()
            
            while True:
                node = node_map[current_node_id]
                ntype = node["type"]
                
                if ntype == "end":
                    if current_node_id not in visited_nodes:
                        completed_nodes.append(node["id"])
                        visited_nodes.add(current_node_id)
                    break
                
                if current_node_id in visited_nodes:
                    # Prevent infinite loop
                    dead_end = True
                    break
                visited_nodes.add(current_node_id)
                
                # Add to path if it's an actionable node (not trigger/condition/end)
                if ntype in ("form", "approval", "task"):
                    path.append((node, last_task_time))
                
                # Determine next node
                edges = edge_map.get(current_node_id, [])
                if not edges:
                    dead_end = True
                    break
                
                if ntype == "condition":
                    # Pick a branch based on outcome
                    # For completed processes, follow "approved" path from approval nodes
                    if process_status == "completed":
                        approved_edges = [e for e in edges if e.get("condition", {}).get("value") == "approved" or not e.get("condition")]
                        edge = approved_edges[0] if approved_edges else edges[0]
                    elif process_status == "rejected":
                        rejected_edges = [e for e in edges if e.get("condition", {}).get("value") == "rejected"]
                        edge = rejected_edges[0] if rejected_edges else edges[-1]
                    else:
                        edge = random.choice(edges)
                elif ntype in ("approval", "form", "task"):
                    # Check conditions on outgoing edges
                    approved_edges = [e for e in edges if e.get("condition", {}).get("value") == "approved"]
                    rejected_edges = [e for e in edges if e.get("condition", {}).get("value") == "rejected"]
                    unconditional_edges = [e for e in edges if not e.get("condition")]
                    
                    if process_status == "rejected" and rejected_edges:
                        edge = rejected_edges[0] if random.random() < 0.4 else (unconditional_edges[0] if unconditional_edges else edges[0])
                    elif process_status == "in_progress" and node["type"] == node_map.get(current_node_id, {}).get("type"):
                        edge = edges[0]
                    else:
                        edge = unconditional_edges[0] if unconditional_edges else edges[0]
                else:
                    edge = edges[0]
                
                current_node_id = edge["target"]
                
                # Advance time based on task type
                if ntype in ("form", "approval", "task"):
                    # Hours to complete: form ~2h, approval ~4h, task ~6h
                    base_hours = {"form": 2, "approval": 4, "task": 6}.get(ntype, 3)
                    # Add variance (exponential-ish)
                    hours_delay = random.expovariate(1.0 / base_hours)
                    hours_delay = min(hours_delay, 48)  # cap at 2 days
                    last_task_time += timedelta(hours=hours_delay)
                    # Ensure we don't go past current time for completed processes
                    if process_status == "completed" and last_task_time > NOW:
                        last_task_time = NOW - timedelta(hours=random.randint(1, 6))
                
                if ntype != "condition" and ntype not in ("trigger",):
                    completed_nodes.append(node["id"])
            
            # Process instance document
            process_doc = {
                "id": pid,
                "org_id": ORG_ID,
                "workflow_id": wf_id,
                "workflow_name": wf["name"],
                "started_by": starter_id,
                "status": process_status,
                "completed_nodes": completed_nodes,
                "context": form_data,
                "created_at": start_time.isoformat(),
                "updated_at": last_task_time.isoformat(),
            }
            if process_status == "in_progress" or process_status == "stuck":
                process_doc["current_node_id"] = current_node_id
            
            processes.append(process_doc)
            
            # ── Tasks ──
            created_tasks_for_process = []
            for node, node_time in path:
                if len(created_tasks_for_process) > 15:
                    break  # safety
                
                tid = next_tid()
                ntype = node["type"]
                
                if len(created_tasks_for_process) < len(path) - 1:
                    # Non-last actionable nodes
                    if process_status == "completed":
                        ts = "done" if ntype == "form" else "approved"
                    elif process_status == "rejected":
                        ts = "rejected"
                    elif process_status == "stuck":
                        ts = "in_progress" if ntype == "task" else "pending"
                    else:
                        ts = "done" if ntype == "form" else "approved"
                else:
                    # Last actionable node
                    if process_status == "completed":
                        ts = "done" if ntype == "form" else "approved"
                    elif process_status == "rejected":
                        ts = "rejected"
                    elif process_status == "in_progress":
                        ts = random.choice(["pending", "in_progress"])
                    else:
                        ts = "in_progress"
                
                # Assignee logic
                assignee_role = node.get("data", {}).get("assignee_role", "کارمند")
                candidates = [u["id"] for u in USERS if u["role"] == assignee_role]
                if not candidates:
                    candidates = [u["id"] for u in USERS if u["role"] in ("کارمند", "مدیر")]
                
                assignee_id = random.choice(candidates)
                
                # Deadline = created + 2-5 working days
                deadline = node_time + timedelta(days=random.randint(2, 5))
                
                task_doc = {
                    "id": tid,
                    "org_id": ORG_ID,
                    "process_id": pid,
                    "workflow_id": wf_id,
                    "workflow_name": wf["name"],
                    "node_id": node["id"],
                    "title": node["label"],
                    "assignee_id": assignee_id,
                    "assignee_role": assignee_role,
                    "type": ntype,
                    "status": ts,
                    "priority": random.choice(["low", "low", "medium", "medium", "high", "urgent"]),
                    "deadline": deadline.isoformat(),
                    "form_data": form_data if ntype == "form" else {},
                    "draft_data": {},
                    "description": "",
                    "created_at": node_time.isoformat(),
                    "updated_at": (node_time + timedelta(hours=random.randint(1, 8))).isoformat(),
                }
                
                # Seen time & done time
                if ts in ("in_progress", "approved", "done"):
                    task_doc["seen_time"] = (node_time + timedelta(hours=random.randint(0, 4))).isoformat()
                if ts in ("approved", "done", "rejected"):
                    task_doc["done_time"] = (node_time + timedelta(hours=random.randint(1, 12))).isoformat()
                
                tasks.append(task_doc)
                created_tasks_for_process.append(task_doc)
                
                # ── Activity Logs ──
                if len(created_tasks_for_process) == 1:
                    activities.append({
                        "id": str(uuid.uuid4()),
                        "org_id": ORG_ID,
                        "actor_id": starter_id,
                        "actor_name": starter["name"],
                        "action": "process.started",
                        "target_type": "process",
                        "target_id": pid,
                        "summary": f"فرایند {wf['name']} توسط {starter['name']} شروع شد",
                        "created_at": start_time.isoformat(),
                    })
                
                activities.append({
                    "id": str(uuid.uuid4()),
                    "org_id": ORG_ID,
                    "actor_id": assignee_id,
                    "actor_name": USER_MAP[assignee_id]["name"],
                    "action": f"task.{ts}",
                    "target_type": "task",
                    "target_id": tid,
                    "summary": f"وضعیت وظیفهٔ «{node['label']}» به {ts} تغییر یافت",
                    "created_at": task_doc["updated_at"],
                })
                
                # ── Comments (30% chance) ──
                if random.random() < 0.30:
                    if ts == "rejected":
                        body = random.choice([
                            "لطفا اصلاحات لازم را اعمال کنید.",
                            "نیازمند بررسی مجدد با مستندات کامل‌تر.",
                            "مبلغ درخواستی بیش از حد مجاز است.",
                            "اطلاعات ناقص است. لطفا تکمیل کنید.",
                        ])
                    elif ts == "approved":
                        body = random.choice([
                            "مورد تایید است. با تشکر.",
                            "تایید شد. ادامه دهید.",
                            "بررسی شد. مشکل خاصی ندارد.",
                        ])
                    else:
                        body = random.choice([
                            "در حال بررسی هستم.",
                            "لطفا مستندات را ارسال کنید.",
                            "در اسرع وقت پیگیری می‌شود.",
                            "اطلاعات تکمیلی نیاز است.",
                        ])
                    
                    comments.append({
                        "id": str(uuid.uuid4()),
                        "org_id": ORG_ID,
                        "target_type": "task",
                        "target_id": tid,
                        "author_id": assignee_id,
                        "author_name": USER_MAP[assignee_id]["name"],
                        "body": body,
                        "created_at": (node_time + timedelta(hours=random.randint(0, 6))).isoformat(),
                    })
            
            # ── System Events (small random sample) ──
            if random.random() < 0.05:
                system_events.append({
                    "id": str(uuid.uuid4()),
                    "org_id": ORG_ID,
                    "level": random.choice(["info", "warning", "error"]),
                    "source": random.choice(["engine", "api", "celery", "celery"]),
                    "message": random.choice([
                        "Task timeout triggered for overdue task",
                        "Process stuck detected, escalation initiated",
                        "API rate limit approaching for workflow operations",
                        "Celery worker queue depth > 100",
                        "MongoDB connection retry on replica set failover",
                        "Deadline exceeded for approval task, auto-escalated to manager",
                        "Duplicate process detection skipped (same context)",
                    ]),
                    "metadata": {},
                    "created_at": (start_time + timedelta(hours=random.randint(1, 24))).isoformat(),
                })
        
        current += timedelta(days=1)
    
    # ── Chat Sessions & Messages (AI workflow generation) ────────────────
    # Simulate about 30-40 chat sessions over 3 months
    chat_users = ["u_des1", "u_des2", "u_admin", "u_mgr_it", "u_mgr_ops"]
    num_sessions = random.randint(30, 40)
    
    for i in range(num_sessions):
        session_id = f"chat_{i+1:03d}"
        user_id = random.choice(chat_users)
        session_time = MONTHS_AGO + timedelta(
            days=random.randint(0, 89),
            hours=random.randint(8, 17),
            minutes=random.randint(0, 59)
        )
        
        chat_sessions.append({
            "id": session_id,
            "org_id": ORG_ID,
            "user_id": user_id,
            "title": random.choice([
                "طراحی فرایند مرخصی", "فرم جدید درخواست", "اتوماسیون گردش کار",
                "ایجاد فرایند خرید", "ساخت فرم سفارشی", "اصلاح فرایند موجود",
                "تغییر در مسیر تایید", "افزودن شرط جدید به فرایند",
            ]),
            "created_at": session_time.isoformat(),
            "message_count": 0,
        })
        
        # 2-8 messages per session
        num_messages = random.randint(2, 8)
        for j in range(num_messages):
            msg_time = session_time + timedelta(minutes=random.randint(1, 30) * (j+1))
            role = "user" if j % 2 == 0 else "assistant"
            if role == "user":
                content = random.choice([
                    "یک فرایند برای درخواست مرخصی طراحی کن.",
                    "فرم درخواست تنخواه با فیلدهای مبلغ و شرح ایجاد کن.",
                    "می‌خواهم فرایند خرید کالا را با تایید دو مرحله‌ای ایجاد کنم.",
                    "فرم استخدام با فیلدهای نام، موقعیت شغلی و حقوق اضافه کن.",
                    "مسیر تایید را تغییر بده به طوری که مبالغ بالای ۱۰ میلیون به مدیرعامل برود.",
                    "برای تیکت‌های IT یک فرایند ساده با سه مرحله طراحی کن.",
                    "شرط بگذار که اگر مرخصی بیشتر از ۳ روز بود تایید نهایی با مدیرعامل باشد.",
                    "فرم جدیدی برای درخواست خدمات ایجاد کن با تب‌های مختلف.",
                    "فرایند رسیدگی به شکایات مشتریان را می‌خواهم.",
                    "فرم ارزیابی عملکرد با فیلدهای امتیاز و توضیحات بساز.",
                ])
            else:
                content = random.choice([
                    "فرایند درخواست مرخصی با موفقیت ایجاد شد. شامل گره‌های: شروع، فرم مرخصی، تایید مدیر تیم، شرط مدت، و پایان.",
                    "فرم تنخواه با فیلدهای عنوان (متن)، مبلغ (عددی)، و شرح مصرف (متن بلند) ایجاد شد.",
                    "فرایند خرید کالا با مسیر تایید مدیر → شرط مبلغ → تایید مالی/خرید مستقیم ایجاد شد.",
                    "فرم با موفقیت به فرایند استخدام اضافه شد.",
                    "تغییر اعمال شد: در شرط مبلغ، در صورت بیش از ۱۰ میلیون مسیر به مدیرعامل هدایت می‌شود.",
                    "فرایند IT با سه گره شروع، فرم ثبت تیکت، و گره پایانی ایجاد شد.",
                    "شرط مدت مرخصی به فرایند اضافه شد. مدت بیشتر از ۳ روز نیاز به تایید مدیرعامل دارد.",
                    "فرم درخواست خدمات با ۵ تب (پذیرایی، نظافت، منسوجات، جابجایی، تخلیه بار) ایجاد شد.",
                    "فرایند رسیدگی به شکایات: دریافت شکایت → بررسی اولیه → بررسی تخصصی → پاسخ به مشتری → پایان.",
                    "فرم ارزیابی عملکرد با فیلدهای امتیاز (عددی ۱-۱۰) و توضیحات ایجاد شد.",
                ])
            
            chat_messages_list.append({
                "id": str(uuid.uuid4()),
                "org_id": ORG_ID,
                "session_id": session_id,
                "user_id": user_id,
                "role": role,
                "content": content,
                "created_at": msg_time.isoformat(),
            })
            chat_sessions[-1]["message_count"] += 1
    
    # ── System Performance Metrics (aggregated hourly) ────────────────────
    metrics = []
    current_hour = MONTHS_AGO.replace(minute=0, second=0, microsecond=0)
    base_api_calls = 500  # per hour at steady state
    
    while current_hour < NOW:
        # Scale with adoption
        days_in = (current_hour - MONTHS_AGO).days
        if days_in < 30:
            volume_factor = 0.5 + 0.5 * (days_in / 30)  # 0.5 → 1.0
        elif days_in < 60:
            volume_factor = 1.0 + 0.3 * ((days_in - 30) / 30)  # 1.0 → 1.3
        else:
            volume_factor = 1.3  # plateau
        
        # Day-of-week & hour adjustments
        full, half, off = is_work_day(current_hour)
        if off:
            hourly_factor = 0.03
        elif half:
            hourly_factor = 0.5 if current_hour.hour < 13 else 0.02
        else:
            h = current_hour.hour
            if h < 7 or h >= 18:
                hourly_factor = 0.05
            elif h < 9:
                hourly_factor = 0.4
            elif h < 11:
                hourly_factor = 1.0
            elif h < 13:
                hourly_factor = 0.7
            elif h < 14:
                hourly_factor = 0.2  # lunch
            elif h < 16:
                hourly_factor = 0.9
            else:
                hourly_factor = 0.5
        
        expected_calls = int(base_api_calls * volume_factor * hourly_factor)
        actual_calls = int(expected_calls * random.uniform(0.90, 1.10))
        actual_calls = max(actual_calls, 0)
        
        # Response times (ms) - degrade slightly with load
        load_pct = volume_factor * hourly_factor
        p50 = int(120 + 80 * load_pct + random.uniform(-10, 10))
        p95 = int(p50 * 3 + 100 * load_pct + random.uniform(-20, 20))
        p99 = int(p95 * 2.5 + random.uniform(-50, 50))
        
        # Error rate (total errors = API errors + validation + system)
        base_error_rate = 0.03 + 0.02 * load_pct  # 3-5% depending on load
        total_errors = int(actual_calls * base_error_rate * random.uniform(0.7, 1.3))
        validation_errors = int(total_errors * random.uniform(0.4, 0.6))
        auth_errors = int(total_errors * random.uniform(0.05, 0.15))
        server_errors = max(0, total_errors - validation_errors - auth_errors)
        
        # CPU & Memory (normalized 0-100)
        base_cpu = 30 + 40 * load_pct
        cpu_usage = min(95, base_cpu + random.uniform(-5, 10))
        mem_usage = min(90, 50 + 25 * load_pct + random.uniform(-3, 8))
        
        # Active users (concurrent)
        active_users = int((5 + 45 * load_pct) * random.uniform(0.8, 1.2))
        
        metrics.append({
            "timestamp": current_hour.isoformat(),
            "api_calls_total": actual_calls,
            "api_calls_success": actual_calls - total_errors,
            "api_calls_error": total_errors,
            "validation_errors": validation_errors,
            "auth_errors": auth_errors,
            "server_errors": server_errors,
            "error_rate_pct": round(base_error_rate * 100, 2),
            "response_time_p50_ms": p50,
            "response_time_p95_ms": p95,
            "response_time_p99_ms": p99,
            "cpu_usage_pct": round(cpu_usage, 1),
            "memory_usage_pct": round(mem_usage, 1),
            "active_users": active_users,
            "processes_started": int(actual_calls * 0.02),  # ~2% of calls start a process
            "tasks_completed": int(actual_calls * 0.015),   # ~1.5% complete a task
        })
        
        current_hour += timedelta(hours=1)
    
    # ── User Performance Summary (per-user statistics) ────────────────────
    user_perf = []
    for u in USERS:
        user_tasks = [t for t in tasks if t["assignee_id"] == u["id"]]
        completed = [t for t in user_tasks if t["status"] in ("done", "approved")]
        rejected = [t for t in user_tasks if t["status"] == "rejected"]
        pending = [t for t in user_tasks if t["status"] in ("pending", "in_progress")]
        
        # Calculate avg completion time (hours)
        times = []
        for t in completed:
            if t.get("created_at") and t.get("done_time"):
                try:
                    ct = datetime.fromisoformat(t["created_at"])
                    dt = datetime.fromisoformat(t["done_time"])
                    times.append((dt - ct).total_seconds() / 3600)
                except:
                    pass
        
        avg_completion_hours = round(sum(times) / len(times), 1) if times else 0
        
        # Overdue tasks
        overdue = 0
        for t in user_tasks:
            if t.get("deadline") and t.get("done_time"):
                try:
                    dl = datetime.fromisoformat(t["deadline"])
                    dt = datetime.fromisoformat(t["done_time"])
                    if dt > dl:
                        overdue += 1
                except:
                    pass
        
        total_assigned = len(user_tasks)
        user_perf.append({
            "user_id": u["id"],
            "name": u["name"],
            "role": u["role"],
            "department": u["dept"],
            "total_tasks_assigned": total_assigned,
            "tasks_completed": len(completed),
            "tasks_rejected": len(rejected),
            "tasks_pending": len(pending),
            "completion_rate_pct": round(len(completed) / total_assigned * 100, 1) if total_assigned > 0 else 0,
            "avg_completion_time_hours": avg_completion_hours,
            "overdue_tasks": overdue,
            "escalated_tasks": random.randint(0, max(1, total_assigned // 10)),
        })
    
    # ── Department Performance ────────────────────────────────────────────
    dept_perf = []
    for dept in DEPARTMENTS:
        dept_users = [u["id"] for u in USERS if u["dept"] == dept["id"]]
        dept_tasks = [t for t in tasks if t["assignee_id"] in dept_users]
        completed = [t for t in dept_tasks if t["status"] in ("done", "approved")]
        rejected = [t for t in dept_tasks if t["status"] == "rejected"]
        
        dept_perf.append({
            "department_id": dept["id"],
            "department_name": dept["name"],
            "total_tasks": len(dept_tasks),
            "tasks_completed": len(completed),
            "tasks_rejected": len(rejected),
            "completion_rate_pct": round(len(completed) / len(dept_tasks) * 100, 1) if dept_tasks else 0,
            "avg_active_users": random.randint(3, 8),
        })
    
    # ── SLA / Time-based analytics ────────────────────────────────────────
    sla_analytics = []
    for wf in WORKFLOWS:
        wf_tasks = [t for t in tasks if t["workflow_id"] == wf["id"]]
        completed = [t for t in wf_tasks if t["status"] in ("done", "approved")]
        
        total_times = []
        for t in completed:
            if t.get("created_at") and t.get("done_time"):
                try:
                    ct = datetime.fromisoformat(t["created_at"])
                    dt = datetime.fromisoformat(t["done_time"])
                    total_times.append((dt - ct).total_seconds() / 3600)
                except:
                    pass
        
        avg_time = round(sum(total_times) / len(total_times), 1) if total_times else 0
        p50_time = sorted(total_times)[len(total_times) // 2] if total_times else 0
        p95_time = sorted(total_times)[int(len(total_times) * 0.95)] if total_times else 0
        
        sla_analytics.append({
            "workflow_id": wf["id"],
            "workflow_name": wf["name"],
            "total_instances": len([p for p in processes if p["workflow_id"] == wf["id"]]),
            "total_tasks": len(wf_tasks),
            "avg_completion_time_hours": avg_time,
            "median_completion_time_hours": round(p50_time, 1),
            "p95_completion_time_hours": round(p95_time, 1),
            "sla_breach_pct": round(random.uniform(5, 20), 1),  # 5-20% breach rate
            "avg_tasks_per_instance": round(len(wf_tasks) / max(1, len([p for p in processes if p["workflow_id"] == wf["id"]])), 1),
        })
    
    # ── Write outputs ─────────────────────────────────────────────────────
    out_dir = Path("/root/jaryan/dataset")
    out_dir.mkdir(exist_ok=True)
    
    # JSON files
    datasets = {
        "organizations": [{"id": ORG_ID, "name": "شرکت فناوران جریان", "slug": "fanaavaran-jaryan"}],
        "departments": DEPARTMENTS,
        "users": USERS,
        "workflows": WORKFLOWS,
        "process_instances": processes,
        "tasks": tasks,
        "activities": activities,
        "comments": comments,
        "chat_sessions": chat_sessions,
        "chat_messages": chat_messages_list,
        "system_events": system_events,
        "metrics_hourly": metrics,
        "user_performance": user_perf,
        "department_performance": dept_perf,
        "sla_analytics": sla_analytics,
    }
    
    for name, data in datasets.items():
        path = out_dir / f"{name}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"✅ {path}  ({len(data)} records)")
    
    # ── Summary ──
    print(f"\n📊 Dataset Summary")
    print(f"{'='*60}")
    print(f"  Organization:     شرکت فناوران جریان")
    print(f"  Period:           {MONTHS_AGO.strftime('%Y-%m-%d')} → {NOW.strftime('%Y-%m-%d')} (90 days)")
    print(f"  Departments:      {len(DEPARTMENTS)}")
    print(f"  Users:            {len(USERS)}")
    print(f"  Workflows:        {len(WORKFLOWS)}")
    print(f"  Process Instances:{len(processes)}")
    print(f"  Tasks:            {len(tasks)}")
    print(f"  Activities:       {len(activities)}")
    print(f"  Comments:         {len(comments)}")
    print(f"  Chat Sessions:    {len(chat_sessions)}")
    print(f"  Chat Messages:    {len(chat_messages_list)}")
    print(f"  System Events:    {len(system_events)}")
    print(f"  Hourly Metrics:   {len(metrics)} data points")
    
    # Monthly breakdown - use timezone-aware comparison
    m1 = sum(1 for p in processes 
             if (MONTHS_AGO + timedelta(days=30)) > datetime.fromisoformat(p["created_at"]) >= MONTHS_AGO)
    m2 = sum(1 for p in processes 
             if (MONTHS_AGO + timedelta(days=60)) > datetime.fromisoformat(p["created_at"]) >= MONTHS_AGO + timedelta(days=30))
    m3 = sum(1 for p in processes 
             if datetime.fromisoformat(p["created_at"]) >= MONTHS_AGO + timedelta(days=60))
    print(f"\n  📈 Monthly Process Instances:")
    print(f"     Month 1 (adoption):    {m1}")
    print(f"     Month 2 (growth):      {m2}")
    print(f"     Month 3 (steady-state):{m3}")
    
    # Status breakdown
    st = {}
    for p in processes:
        st[p["status"]] = st.get(p["status"], 0) + 1
    print(f"\n  📊 Process Status:")
    for k, v in sorted(st.items(), key=lambda x: -x[1]):
        print(f"     {k}: {v} ({v/len(processes)*100:.1f}%)")
    
    # Workflow breakdown
    print(f"\n  🔄 Per Workflow:")
    for wf in WORKFLOWS:
        wf_count = sum(1 for p in processes if p["workflow_id"] == wf["id"])
        print(f"     {wf['name']}: {wf_count}")
    
    return datasets

if __name__ == "__main__":
    generate_datasets()