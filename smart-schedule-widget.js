// Variables used to start the script:
// Widget Settings:
// - Script: SmartSchedule
// - Parameter (optional): URL to your schedule JSON or leave empty to use synced/embedded data.

/**
 * Smart Schedule iOS Widget (Scriptable)
 * สำหรับ iPhone และ iPad
 * รองรับ Widget ขนาด Medium (4x2 แนวนอน), Small (2x2), และ Large (4x4)
 * 
 * รูปแบบการจัดวางขนาด Medium (4x2 แนวนอน):
 * - CURRENT CLASS: แถบแนวนอนด้านบน (กว้าง 3/4 หรือเต็มพื้นที่)
 * - NEXT CLASS: แถบแนวนอนด้านล่าง (กว้าง 3/4 หรือเต็มพื้นที่)
 * - TASKS: แถบแนวตั้งด้านขวา (กว้าง 1/4 ของ Widget แบ่ง 1 กล่องต่อนึง task)
 * - ซ่อนแถบ TASKS อัตโนมัติเมื่อไม่มีงานค้าง เพื่อให้ CURRENT และ NEXT ขยายเต็มความกว้าง
 */

// --- CONFIGURATION ---
const APP_URL = "https://flyingtoasts.github.io/my-uni-schedule/"; // URL ของเว็บแอปเพื่อเปิดเมื่อแตะ Widget
const REMOTE_DATA_URL = (args.widgetParameter || "").trim(); // ใส่ URL JSON ตารางเรียนของคุณ หรือใส่ในช่อง Parameter ของ Widget

// ข้อมูลเริ่มต้น (จะถูกแทนที่ด้วยข้อมูลจริงของผู้ใช้เมื่อกดจากในเว็บแอป)
const DEFAULT_PAYLOAD = {
  "updatedAt": new Date().toISOString(),
  "sessions": [
    {
      "day": 1, // จันทร์
      "start": "09:00",
      "end": "12:00",
      "code": "01208112-65",
      "name": "การเขียนแบบวิศวกรรมเครื่องกล",
      "room": "E11-N709",
      "color": "#38bdf8"
    },
    {
      "day": 1,
      "start": "13:00",
      "end": "16:00",
      "code": "01208201-65",
      "name": "กลศาสตร์วิศวกรรม",
      "room": "E11-N402",
      "color": "#34d399"
    },
    {
      "day": 2, // อังคาร
      "start": "10:00",
      "end": "12:00",
      "code": "2304104",
      "name": "GEN PHYS II",
      "room": "PHYS1 212",
      "color": "#818cf8"
    }
  ],
  "tasks": [
    { "title": "ส่งแบบฝึกหัดเขียนแบบ", "date": "2026-11-26", "badge": "ส่งงาน", "color": "#f59e0b" },
    { "title": "อ่านสอบกลางภาค Phys II", "date": "2026-11-28", "badge": "สอบกลางภาค", "color": "#f43f5e" }
  ],
  "exams": []
};

// --- DATA FETCHING & CACHE ---
const fm = FileManager.local();
const cacheDir = fm.documentsDirectory();
const cacheFile = fm.joinPath(cacheDir, "smart_schedule_ios_cache.json");

async function loadSchedulePayload() {
  let url = REMOTE_DATA_URL;
  if (url) {
    try {
      let req = new Request(url);
      req.timeoutInterval = 8;
      let data = await req.loadJSON();
      if (data && (data.sessions || data.scheduleData)) {
        fm.writeString(cacheFile, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn("Could not load from remote URL, trying local cache: " + e);
    }
  }

  // อ่านจาก Cache ถ้ามี
  if (fm.fileExists(cacheFile)) {
    try {
      let cached = JSON.parse(fm.readString(cacheFile));
      if (cached && (cached.sessions || cached.scheduleData)) return cached;
    } catch (e) {}
  }

  return DEFAULT_PAYLOAD;
}

// --- TIME & SCHEDULE HELPERS ---
const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_DAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function getBangkokNow() {
  return new Date();
}

function parseTimeToMinutes(tStr) {
  if (!tStr) return 0;
  let p = tStr.split(":");
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function formatTaskDate(dStr) {
  if (!dStr) return "";
  let parts = dStr.split("-");
  if (parts.length >= 3) {
    let day = parseInt(parts[2], 10);
    let month = parseInt(parts[1], 10);
    if (!isNaN(day) && !isNaN(month) && month >= 1 && month <= 12) {
      return `${day} ${THAI_MONTHS[month - 1]}`;
    }
  }
  return dStr.slice(5);
}

function formatTaskBadge(badge) {
  if (!badge) return "";
  if (badge === "สอบกลางภาค") return "สอบกลาง";
  if (badge === "สอบปลายภาค") return "สอบปลาย";
  return badge;
}

function normalizePayload(raw) {
  let sessions = [];
  let tasks = [];
  let exams = [];

  let now = getBangkokNow();
  let todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  if (Array.isArray(raw.sessions)) {
    sessions = raw.sessions;
  }
  if (Array.isArray(raw.tasks)) {
    tasks = raw.tasks;
  }
  if (Array.isArray(raw.exams)) {
    exams = raw.exams;
  }

  // หากเป็นก้อน scheduleData ดั้งเดิมจากเว็บแอป
  if (Array.isArray(raw.scheduleData)) {
    raw.scheduleData.forEach(c => {
      if (c.day !== undefined && c.start && c.end) {
        sessions.push({
          day: Number(c.day),
          start: c.start,
          end: c.end,
          code: c.code || "",
          name: c.name || "",
          room: c.room || "",
          color: c.color || "#38bdf8"
        });
      }
      if (Array.isArray(c.extraSessions)) {
        c.extraSessions.forEach(ex => {
          if (ex.day !== undefined && ex.start && ex.end) {
            sessions.push({
              day: Number(ex.day),
              start: ex.start,
              end: ex.end,
              code: c.code || "",
              name: c.name || "",
              room: ex.room || c.room || "",
              color: c.color || "#38bdf8"
            });
          }
        });
      }
      // ดึงการบ้าน/งาน
      if (Array.isArray(c.notes)) {
        c.notes.forEach(n => {
          if (!n.done && n.date) {
            tasks.push({
              title: n.text || ("งาน " + (c.code || c.name)),
              date: n.date,
              badge: n.type === "homework" ? "ส่งงาน" : (n.type === "cancel" ? "งดคลาส" : "ประกาศ"),
              color: n.type === "homework" ? "#f59e0b" : "#38bdf8"
            });
          }
        });
      }
      // ดึงตารางสอบ
      if (c.exams) {
        ['midterm', 'final'].forEach(t => {
          let ex = c.exams[t];
          if (ex && ex.date && ex.start) {
            let exLabel = t === 'midterm' ? "สอบกลางภาค" : "สอบปลายภาค";
            exams.push({
              code: c.code || "",
              name: c.name || "",
              room: ex.room || "",
              start: ex.start,
              end: ex.end || ex.start,
              date: ex.date,
              badge: exLabel,
              color: "#f43f5e"
            });
            tasks.push({
              title: `สอบ ${c.code || c.name} (${t === 'midterm' ? 'กลางภาค' : 'ปลายภาค'})`,
              date: ex.date,
              badge: exLabel,
              color: "#f43f5e"
            });
          }
        });
      }
    });
  }

  // กรองงานและสอบที่ยังไม่หมดอายุ (วันนี้เป็นต้นไป)
  tasks = tasks.filter(t => !t.date || t.date >= todayIso);
  tasks.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  return { sessions, tasks, exams };
}

function findCurrentAndNextSession(sessions, exams = []) {
  let now = getBangkokNow();
  let currentDay = now.getDay();
  let currentMinutes = now.getHours() * 60 + now.getMinutes();

  let current = null;
  let next = null;

  // 1. ค้นหาคาบเรียนที่กำลังเรียนอยู่ตอนนี้
  for (let s of sessions) {
    if (s.day === currentDay) {
      let sMin = parseTimeToMinutes(s.start);
      let eMin = parseTimeToMinutes(s.end);
      if (currentMinutes >= sMin && currentMinutes < eMin) {
        current = Object.assign({}, s);
        current.isExam = false;
        break;
      }
    }
  }

  // 2. ค้นหาคาบถัดไปที่ใกล้ที่สุด (วิชาเรียน + วันสอบ)
  let candidates = [];

  for (let s of sessions) {
    let diffDays = (s.day - currentDay + 7) % 7;
    let sMin = parseTimeToMinutes(s.start);
    if (diffDays === 0 && sMin <= currentMinutes) {
      diffDays = 7; // ผ่านไปแล้วในวันนี้ ให้เป็นสัปดาห์หน้า
    }
    let totalScore = diffDays * 1440 + sMin;
    candidates.push({
      session: {
        code: s.code,
        name: s.name,
        room: s.room,
        start: s.start,
        end: s.end,
        day: s.day,
        isExam: false
      },
      diffDays,
      score: totalScore
    });
  }

  // รวมวันสอบที่ใกล้จะถึง
  if (Array.isArray(exams)) {
    for (let ex of exams) {
      if (ex.date && ex.start) {
        let exDate = new Date(ex.date + "T" + ex.start + ":00");
        let diffMs = exDate.getTime() - now.getTime();
        if (diffMs > 0) {
          let diffDays = Math.floor(diffMs / (24 * 3600 * 1000));
          let sMin = parseTimeToMinutes(ex.start);
          let totalScore = diffDays * 1440 + sMin;
          candidates.push({
            session: {
              code: ex.code,
              name: `[${ex.badge || 'สอบ'}] ${ex.name}`,
              room: ex.room || 'ยังไม่ระบุห้องสอบ',
              start: ex.start,
              end: ex.end || ex.start,
              date: ex.date,
              day: exDate.getDay(),
              isExam: true
            },
            diffDays,
            score: totalScore
          });
        }
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  if (candidates.length > 0) {
    next = candidates[0].session;
    next.diffDays = candidates[0].diffDays;
  }

  return { current, next };
}

// --- WIDGET BUILDER ---
async function createWidget() {
  let raw = await loadSchedulePayload();
  let { sessions, tasks, exams } = normalizePayload(raw);
  let { current, next } = findCurrentAndNextSession(sessions, exams);

  let now = getBangkokNow();
  let dateThai = `${THAI_DAYS_SHORT[now.getDay()]} ${now.getDate()} ${THAI_MONTHS[now.getMonth()]}`;

  let widget = new ListWidget();
  widget.backgroundColor = new Color("#090d16");
  widget.url = APP_URL;
  widget.setPadding(8, 11, 8, 11);

  let family = config.widgetFamily || "medium";

  // --- HEADER ROW ---
  let headerRow = widget.addStack();
  headerRow.layoutHorizontally();
  headerRow.centerAlignContent();

  let dot = headerRow.addText("● ");
  dot.font = Font.systemFont(9);
  dot.textColor = new Color("#38bdf8");

  let appTitle = headerRow.addText("Smart Schedule");
  appTitle.font = Font.boldSystemFont(10.5);
  appTitle.textColor = new Color("#e2e8f0");

  headerRow.addSpacer();

  let dateText = headerRow.addText(dateThai);
  dateText.font = Font.mediumSystemFont(10.5);
  dateText.textColor = new Color("#94a3b8");

  widget.addSpacer(5);

  // --- BODY LAYOUT BY WIDGET SIZE ---
  if (family === "small") {
    renderSmallWidget(widget, current, next);
  } else if (family === "large") {
    renderLargeWidget(widget, current, next, tasks, sessions, now);
  } else {
    // 4x2 แนวนอน: CURRENT CLASS (แถบบน) | NEXT CLASS (แถบล่าง) | TASKS (แถบขวา)
    renderMediumWidget(widget, current, next, tasks);
  }

  return widget;
}

// ขนาดกลาง (4x2 แนวนอน)
function renderMediumWidget(widget, current, next, tasks) {
  let bodyRow = widget.addStack();
  bodyRow.layoutHorizontally();
  bodyRow.spacing = 6;

  let hasTasks = tasks && tasks.length > 0;

  // ฝั่งซ้าย: CURRENT CLASS (บน) + NEXT CLASS (ล่าง)
  let leftCol = bodyRow.addStack();
  leftCol.layoutVertically();
  leftCol.spacing = 5;

  // ----------------------------------------------------
  // กล่อง 1: CURRENT CLASS (แถบแนวนอนด้านบน)
  // ----------------------------------------------------
  let curBox = leftCol.addStack();
  curBox.layoutVertically();
  curBox.backgroundColor = new Color("#131d2e");
  curBox.cornerRadius = 10;
  curBox.borderWidth = 1;
  curBox.borderColor = new Color("#1e2e4a");
  curBox.setPadding(6, 9, 6, 9);

  let curHeader = curBox.addStack();
  curHeader.layoutHorizontally();
  curHeader.centerAlignContent();

  let curTitle = curHeader.addText(current && current.isExam ? "CURRENT EXAM" : "CURRENT CLASS");
  curTitle.font = Font.boldSystemFont(8.5);
  curTitle.textColor = new Color("#38bdf8");

  curHeader.addSpacer();

  let curBadge = curHeader.addText(current ? (current.isExam ? "● IN EXAM" : "● IN CLASS") : "○ FREE");
  curBadge.font = Font.boldSystemFont(8);
  curBadge.textColor = current ? new Color("#34d399") : new Color("#94a3b8");

  curBox.addSpacer();

  if (current) {
    let curNameLine = curBox.addText(`${current.code ? current.code + ' ' : ''}${current.name}`);
    curNameLine.font = Font.boldSystemFont(11);
    curNameLine.textColor = Color.white();
    curNameLine.lineLimit = 1;

    curBox.addSpacer(2);

    let curDetailLine = curBox.addStack();
    curDetailLine.layoutHorizontally();
    curDetailLine.centerAlignContent();

    let curTime = curDetailLine.addText(`⏰ ${current.start} - ${current.end}`);
    curTime.font = Font.mediumSystemFont(9);
    curTime.textColor = new Color("#fbbf24");

    if (current.room) {
      let sep = curDetailLine.addText("  •  ");
      sep.font = Font.systemFont(9);
      sep.textColor = new Color("#64748b");

      let curRoom = curDetailLine.addText(`📍 ห้อง ${current.room}`);
      curRoom.font = Font.systemFont(9);
      curRoom.textColor = new Color("#94a3b8");
      curRoom.lineLimit = 1;
    }
  } else {
    let freeTitle = curBox.addText("ไม่มีคาบเรียนในขณะนี้");
    freeTitle.font = Font.boldSystemFont(11);
    freeTitle.textColor = new Color("#f1f5f9");

    curBox.addSpacer(2);

    let freeSub = curBox.addText("มีเวลาพักผ่อนแล้ว ✨");
    freeSub.font = Font.systemFont(9.5);
    freeSub.textColor = new Color("#94a3b8");
  }

  curBox.addSpacer();

  // ----------------------------------------------------
  // กล่อง 2: NEXT CLASS (แถบแนวนอนด้านล่าง)
  // ----------------------------------------------------
  let nextBox = leftCol.addStack();
  nextBox.layoutVertically();
  nextBox.backgroundColor = new Color("#131d2e");
  nextBox.cornerRadius = 10;
  nextBox.borderWidth = 1;
  nextBox.borderColor = new Color("#1e2e4a");
  nextBox.setPadding(6, 9, 6, 9);

  let nextHeader = nextBox.addStack();
  nextHeader.layoutHorizontally();
  nextHeader.centerAlignContent();

  let nextLabel = nextHeader.addText(next && next.isExam ? "NEXT EXAM" : "NEXT CLASS");
  nextLabel.font = Font.boldSystemFont(8.5);
  nextLabel.textColor = new Color("#94a3b8");

  nextHeader.addSpacer();

  if (next) {
    let dayStr = "";
    if (next.diffDays === 0) dayStr = "วันนี้";
    else if (next.diffDays === 1) dayStr = "พรุ่งนี้";
    else if (next.day !== undefined) {
      dayStr = THAI_DAYS[next.day];
      if (next.diffDays !== undefined && next.diffDays > 0) {
        let targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + next.diffDays);
        dayStr += ` ${targetDate.getDate()} ${THAI_MONTHS[targetDate.getMonth()]}`;
      }
    } else if (next.date) {
      dayStr = formatTaskDate(next.date);
    }

    let nextDayText = nextHeader.addText(dayStr);
    nextDayText.font = Font.mediumSystemFont(8);
    nextDayText.textColor = new Color("#cbd5e1");
  }

  nextBox.addSpacer();

  if (next) {
    let nextNameLine = nextBox.addText(`${next.code ? next.code + ' ' : ''}${next.name}`);
    nextNameLine.font = Font.boldSystemFont(11);
    nextNameLine.textColor = Color.white();
    nextNameLine.lineLimit = 1;

    nextBox.addSpacer(2);

    let nextDetailLine = nextBox.addStack();
    nextDetailLine.layoutHorizontally();
    nextDetailLine.centerAlignContent();

    let nextTime = nextDetailLine.addText(`⏰ ${next.start} - ${next.end}`);
    nextTime.font = Font.mediumSystemFont(9);
    nextTime.textColor = new Color("#fbbf24");

    if (next.room) {
      let sep = nextDetailLine.addText("  •  ");
      sep.font = Font.systemFont(9);
      sep.textColor = new Color("#64748b");

      let nextRoom = nextDetailLine.addText(`📍 ห้อง ${next.room}`);
      nextRoom.font = Font.systemFont(9);
      nextRoom.textColor = new Color("#94a3b8");
      nextRoom.lineLimit = 1;
    }
  } else {
    let noNext = nextBox.addText("ไม่มีข้อมูลคาบถัดไป");
    noNext.font = Font.boldSystemFont(11);
    noNext.textColor = new Color("#94a3b8");

    nextBox.addSpacer(2);

    let noNextSub = nextBox.addText("พักผ่อนได้เต็มที่ 🎉");
    noNextSub.font = Font.systemFont(9.5);
    noNextSub.textColor = new Color("#64748b");
  }

  nextBox.addSpacer();

  // ----------------------------------------------------
  // กล่อง 3: TASKS (แถบแนวตั้งด้านขวา)
  // ซ่อนอัตโนมัติหากไม่มีงานค้าง
  // ----------------------------------------------------
  if (hasTasks) {
    let taskBox = bodyRow.addStack();
    taskBox.layoutVertically();
    taskBox.backgroundColor = new Color("#131d2e");
    taskBox.cornerRadius = 10;
    taskBox.borderWidth = 1;
    taskBox.borderColor = new Color("#1e2e4a");
    taskBox.setPadding(6, 7, 6, 7);
    taskBox.size = new Size(106, 0); // ขยายความกว้างเป็น 106pt เพื่อให้แสดงชื่องานและวันที่ได้ครบถ้วน ไม่ถูกตัดขอบ

    let taskHeader = taskBox.addStack();
    taskHeader.layoutHorizontally();
    taskHeader.centerAlignContent();

    let taskTitle = taskHeader.addText("TASKS");
    taskTitle.font = Font.boldSystemFont(8.5);
    taskTitle.textColor = new Color("#f59e0b");

    taskHeader.addSpacer();

    let taskCount = taskHeader.addText(String(tasks.length));
    taskCount.font = Font.boldSystemFont(8);
    taskCount.textColor = new Color("#fbbf24");

    let displayTasks = tasks.slice(0, 3); // แสดงสูงสุด 3 รายการ

    if (displayTasks.length === 1) {
      taskBox.addSpacer();
      let t = displayTasks[0];
      let itemCard = taskBox.addStack();
      itemCard.layoutVertically();
      itemCard.backgroundColor = new Color("#1a263c");
      itemCard.cornerRadius = 6;
      itemCard.setPadding(5, 6, 5, 6);

      let tText = itemCard.addText(t.title || "งาน");
      tText.font = Font.mediumSystemFont(8.5);
      tText.textColor = Color.white();
      tText.lineLimit = 2;

      if (t.date || t.badge) {
        itemCard.addSpacer(3);
        let b = formatTaskBadge(t.badge);
        let d = formatTaskDate(t.date);
        let dateLabel = b && d ? `[${b}] ${d}` : (b ? `[${b}]` : d);
        let tDate = itemCard.addText(dateLabel);
        tDate.font = Font.systemFont(7.5);
        tDate.textColor = new Color(t.color || "#38bdf8");
        tDate.lineLimit = 1;
      }
      taskBox.addSpacer();
    } else if (displayTasks.length === 2) {
      taskBox.addSpacer();
      for (let i = 0; i < displayTasks.length; i++) {
        let t = displayTasks[i];
        let itemCard = taskBox.addStack();
        itemCard.layoutVertically();
        itemCard.backgroundColor = new Color("#1a263c");
        itemCard.cornerRadius = 6;
        itemCard.setPadding(4, 5, 4, 5);

        let tText = itemCard.addText(t.title || "งาน");
        tText.font = Font.mediumSystemFont(8);
        tText.textColor = Color.white();
        tText.lineLimit = 2; // อนุญาตให้ตัด 2 บรรทัดได้ เพื่อให้ชื่องานไม่ถูกตัดขาดด้วย ...

        if (t.date || t.badge) {
          itemCard.addSpacer(2);
          let b = formatTaskBadge(t.badge);
          let d = formatTaskDate(t.date);
          let dateLabel = b && d ? `[${b}] ${d}` : (b ? `[${b}]` : d);
          let tDate = itemCard.addText(dateLabel);
          tDate.font = Font.systemFont(7.5);
          tDate.textColor = new Color(t.color || "#38bdf8");
          tDate.lineLimit = 1;
        }

        if (i === 0) taskBox.addSpacer(4);
      }
      taskBox.addSpacer();
    } else {
      taskBox.addSpacer(2);
      for (let i = 0; i < displayTasks.length; i++) {
        let t = displayTasks[i];
        let itemCard = taskBox.addStack();
        itemCard.layoutVertically();
        itemCard.backgroundColor = new Color("#1a263c");
        itemCard.cornerRadius = 6;
        itemCard.setPadding(3, 5, 3, 5);

        let tText = itemCard.addText(t.title || "งาน");
        tText.font = Font.mediumSystemFont(7.5);
        tText.textColor = Color.white();
        tText.lineLimit = 1;

        if (t.date || t.badge) {
          let b = formatTaskBadge(t.badge);
          let d = formatTaskDate(t.date);
          let dateLabel = b && d ? `[${b}] ${d}` : (b ? `[${b}]` : d);
          let tDate = itemCard.addText(dateLabel);
          tDate.font = Font.systemFont(7);
          tDate.textColor = new Color(t.color || "#38bdf8");
          tDate.lineLimit = 1;
        }

        if (i < displayTasks.length - 1) taskBox.addSpacer(3);
      }
      taskBox.addSpacer();
    }
  }
}

// Small Widget (2x2)
function renderSmallWidget(widget, current, next) {
  let body = widget.addStack();
  body.layoutVertically();
  body.spacing = 3;

  let curHeader = body.addText(current ? "🟢 กำลังเรียน" : "⚪ ไม่มีเรียนขณะนี้");
  curHeader.font = Font.boldSystemFont(8.5);
  curHeader.textColor = current ? new Color("#34d399") : new Color("#94a3b8");

  if (current) {
    let curTitle = body.addText(`${current.code ? current.code + ' ' : ''}${current.name}`);
    curTitle.font = Font.boldSystemFont(9.5);
    curTitle.textColor = Color.white();
    curTitle.lineLimit = 1;

    let curTime = body.addText(`⏰ ${current.start}-${current.end} · ${current.room || ""}`);
    curTime.font = Font.systemFont(8);
    curTime.textColor = new Color("#94a3b8");
  } else {
    let free = body.addText("มีเวลาพักผ่อน ✨");
    free.font = Font.systemFont(8.5);
    free.textColor = new Color("#64748b");
  }

  body.addSpacer(3);

  let nextHeader = body.addText(next && next.isExam ? "🔴 สอบถัดไป" : "🟡 คาบถัดไป");
  nextHeader.font = Font.boldSystemFont(8.5);
  nextHeader.textColor = next && next.isExam ? new Color("#f43f5e") : new Color("#fbbf24");

  if (next) {
    let nextTitle = body.addText(`${next.code ? next.code + ' ' : ''}${next.name}`);
    nextTitle.font = Font.boldSystemFont(9.5);
    nextTitle.textColor = Color.white();
    nextTitle.lineLimit = 1;

    let dayStr = next.diffDays === 0 ? "วันนี้" : (next.diffDays === 1 ? "พรุ่งนี้" : THAI_DAYS[next.day]);
    let nextTime = body.addText(`${dayStr} ${next.start} · ${next.room || ""}`);
    nextTime.font = Font.systemFont(8);
    nextTime.textColor = new Color("#94a3b8");
  } else {
    let noNext = body.addText("ไม่มีข้อมูล");
    noNext.font = Font.systemFont(8.5);
    noNext.textColor = new Color("#64748b");
  }
}

// Large Widget (4x4)
function renderLargeWidget(widget, current, next, tasks, sessions, now) {
  renderMediumWidget(widget, current, next, tasks);

  widget.addSpacer(8);

  let listHeader = widget.addText("ตารางเรียนวันนี้ทั้งหมด");
  listHeader.font = Font.boldSystemFont(10.5);
  listHeader.textColor = new Color("#e2e8f0");

  widget.addSpacer(4);

  let todaySessions = sessions.filter(s => s.day === now.getDay());
  todaySessions.sort((a, b) => a.start.localeCompare(b.start));

  if (todaySessions.length === 0) {
    let empty = widget.addText("วันนี้ไม่มีคาบเรียน พักผ่อนได้เต็มที่ 🎉");
    empty.font = Font.systemFont(9.5);
    empty.textColor = new Color("#64748b");
  } else {
    for (let s of todaySessions.slice(0, 4)) {
      let row = widget.addStack();
      row.layoutHorizontally();
      row.backgroundColor = new Color("#131d2e");
      row.cornerRadius = 8;
      row.setPadding(4, 7, 4, 7);

      let time = row.addText(`${s.start}-${s.end}`);
      time.font = Font.mediumSystemFont(8.5);
      time.textColor = new Color("#38bdf8");

      row.addSpacer(6);

      let title = row.addText(`${s.code} ${s.name}`);
      title.font = Font.systemFont(8.5);
      title.textColor = Color.white();
      title.lineLimit = 1;

      row.addSpacer();

      if (s.room) {
        let room = row.addText(s.room);
        room.font = Font.systemFont(8);
        room.textColor = new Color("#94a3b8");
      }

      widget.addSpacer(3);
    }
  }
}

// --- RUN SCRIPT ---
(async () => {
  let widget = await createWidget();
  if (config.runsInWidget) {
    Script.setWidget(widget);
    Script.complete();
  } else {
    // พรีวิวในแอป Scriptable ตามขนาดที่ต้องการ (ขนาดกลาง 4x2 แนวนอน)
    await widget.presentMedium();
  }
})();
