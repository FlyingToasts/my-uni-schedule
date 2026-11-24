// Variables used to start the script:
// Widget Settings:
// - Script: SmartSchedule
// - Parameter (optional): URL to your schedule JSON or leave empty to use synced/embedded data.

/**
 * Smart Schedule iOS Widget (Scriptable)
 * สำหรับ iPhone และ iPad
 * รองรับ Widget ขนาด Medium (4x2 แนวนอน), Small (2x2), และ Large (4x4)
 */

// --- CONFIGURATION ---
const APP_URL = "https://flyingtoasts.github.io/my-uni-schedule/"; // URL ของเว็บแอปเพื่อเปิดเมื่อแตะ Widget
const REMOTE_DATA_URL = args.widgetParameter || ""; // ใส่ URL JSON ตารางเรียนของคุณ หรือใส่ในช่อง Parameter ของ Widget

// ข้อมูลเริ่มต้นสำหรับกรณีที่ยังไม่ได้ใส่ URL หรือออฟไลน์
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
    { "title": "อ่านสอบกลางภาค Phys II", "date": "2026-11-28", "badge": "สอบ", "color": "#f43f5e" }
  ]
};

// --- DATA FETCHING & CACHE ---
const fm = FileManager.local();
const cacheDir = fm.documentsDirectory();
const cacheFile = fm.joinPath(cacheDir, "smart_schedule_ios_cache.json");

async function loadSchedulePayload() {
  let url = REMOTE_DATA_URL.trim();
  if (url) {
    try {
      let req = new Request(url);
      req.timeoutInterval = 6;
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

function normalizePayload(raw) {
  let sessions = [];
  let tasks = [];

  if (Array.isArray(raw.sessions)) {
    sessions = raw.sessions;
  } else if (Array.isArray(raw.scheduleData)) {
    // รองรับกรณีส่งตรงจาก scheduleData ของเว็บแอป
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
      if (Array.isArray(c.notes)) {
        c.notes.forEach(n => {
          if (!n.done && n.date) {
            tasks.push({
              title: n.text || "งานวิชา " + (c.code || c.name),
              date: n.date,
              badge: n.type === "homework" ? "ส่งงาน" : (n.type === "cancel" ? "งดคลาส" : "ประกาศ"),
              color: n.type === "homework" ? "#f59e0b" : "#38bdf8"
            });
          }
        });
      }
    });
  }

  if (Array.isArray(raw.tasks)) {
    tasks = raw.tasks;
  }

  return { sessions, tasks };
}

function parseTimeToMinutes(tStr) {
  if (!tStr) return 0;
  let p = tStr.split(":");
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function findCurrentAndNextSession(sessions) {
  let now = getBangkokNow();
  let currentDay = now.getDay(); // 0 = อาทิตย์, 1 = จันทร์, ...
  let currentMinutes = now.getHours() * 60 + now.getMinutes();

  let current = null;
  let next = null;

  // 1. ค้นหาคาบที่กำลังเรียนอยู่ตอนนี้
  for (let s of sessions) {
    if (s.day === currentDay) {
      let sMin = parseTimeToMinutes(s.start);
      let eMin = parseTimeToMinutes(s.end);
      if (currentMinutes >= sMin && currentMinutes < eMin) {
        current = s;
        break;
      }
    }
  }

  // 2. ค้นหาคาบถัดไปที่ใกล้ที่สุด
  let candidates = [];
  for (let s of sessions) {
    let diffDays = (s.day - currentDay + 7) % 7;
    let sMin = parseTimeToMinutes(s.start);
    if (diffDays === 0 && sMin <= currentMinutes) {
      diffDays = 7; // ผ่านไปแล้วในวันนี้ ให้เป็นสัปดาห์หน้า
    }
    let totalScore = diffDays * 1440 + sMin;
    candidates.push({ session: s, diffDays, score: totalScore });
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
  let { sessions, tasks } = normalizePayload(raw);
  let { current, next } = findCurrentAndNextSession(sessions);

  let now = getBangkokNow();
  let dateThai = `${THAI_DAYS_SHORT[now.getDay()]} ${now.getDate()} ${THAI_MONTHS[now.getMonth()]}`;

  let widget = new ListWidget();
  widget.backgroundColor = new Color("#090d16");
  widget.url = APP_URL;
  widget.setPadding(12, 14, 12, 14);

  let family = config.widgetFamily || "medium";

  // --- HEADER ROW ---
  let headerRow = widget.addStack();
  headerRow.layoutHorizontally();
  headerRow.centerAlignContent();

  let dot = headerRow.addText("● ");
  dot.font = Font.systemFont(10);
  dot.textColor = new Color("#38bdf8");

  let appTitle = headerRow.addText("Smart Schedule");
  appTitle.font = Font.boldSystemFont(11);
  appTitle.textColor = new Color("#e2e8f0");

  headerRow.addSpacer();

  let dateText = headerRow.addText(dateThai);
  dateText.font = Font.mediumSystemFont(11);
  dateText.textColor = new Color("#94a3b8");

  widget.addSpacer(8);

  // --- BODY LAYOUT BY WIDGET SIZE ---
  if (family === "small") {
    // ขนาดเล็ก (2x2)
    renderSmallWidget(widget, current, next);
  } else if (family === "large") {
    // ขนาดใหญ่ (4x4)
    renderLargeWidget(widget, current, next, tasks, sessions, now);
  } else {
    // ขนาดกลาง (4x2 แนวนอน) - ดีไซน์สไตล์ Android Widget
    renderMediumWidget(widget, current, next, tasks);
  }

  return widget;
}

// 4x2 แนวนอน: CURRENT CLASS (ซ้าย) | NEXT CLASS (กลาง) | TASKS (ขวา 1/4)
function renderMediumWidget(widget, current, next, tasks) {
  let mainRow = widget.addStack();
  mainRow.layoutHorizontally();
  mainRow.spacing = 8;

  let hasTasks = tasks && tasks.length > 0;

  // กล่อง 1: CURRENT CLASS
  let currentCard = mainRow.addStack();
  currentCard.layoutVertically();
  currentCard.backgroundColor = new Color("#131d2e");
  currentCard.cornerRadius = 12;
  currentCard.borderWidth = 1;
  currentCard.borderColor = new Color("#1e2e4a");
  currentCard.setPadding(8, 10, 8, 10);

  let curHeader = currentCard.addStack();
  curHeader.layoutHorizontally();
  let curLabel = curHeader.addText("CURRENT CLASS");
  curLabel.font = Font.boldSystemFont(9);
  curLabel.textColor = new Color("#38bdf8");
  curHeader.addSpacer();

  let curBadge = curHeader.addText(current ? "● IN CLASS" : "○ FREE");
  curBadge.font = Font.boldSystemFont(8);
  curBadge.textColor = current ? new Color("#34d399") : new Color("#94a3b8");

  currentCard.addSpacer(4);

  if (current) {
    let codeText = currentCard.addText(current.code || "วิชาเรียน");
    codeText.font = Font.boldSystemFont(11);
    codeText.textColor = Color.white();
    codeText.lineLimit = 1;

    let nameText = currentCard.addText(current.name || "");
    nameText.font = Font.systemFont(10);
    nameText.textColor = new Color("#cbd5e1");
    nameText.lineLimit = 1;

    currentCard.addSpacer();

    let timeText = currentCard.addText(`⏰ ${current.start} - ${current.end}`);
    timeText.font = Font.mediumSystemFont(9);
    timeText.textColor = new Color("#fbbf24");
    timeText.lineLimit = 1;

    if (current.room) {
      let roomText = currentCard.addText(`📍 ${current.room}`);
      roomText.font = Font.systemFont(9);
      roomText.textColor = new Color("#94a3b8");
      roomText.lineLimit = 1;
    }
  } else {
    currentCard.addSpacer();
    let freeTitle = currentCard.addText("ไม่มีคาบเรียนในขณะนี้");
    freeTitle.font = Font.mediumSystemFont(10);
    freeTitle.textColor = new Color("#e2e8f0");
    freeTitle.lineLimit = 1;

    let freeSub = currentCard.addText("มีเวลาพักผ่อนแล้ว ✨");
    freeSub.font = Font.systemFont(9);
    freeSub.textColor = new Color("#94a3b8");
    currentCard.addSpacer();
  }

  // กล่อง 2: NEXT CLASS
  let nextCard = mainRow.addStack();
  nextCard.layoutVertically();
  nextCard.backgroundColor = new Color("#131d2e");
  nextCard.cornerRadius = 12;
  nextCard.borderWidth = 1;
  nextCard.borderColor = new Color("#1e2e4a");
  nextCard.setPadding(8, 10, 8, 10);

  let nextLabel = nextCard.addText("NEXT CLASS");
  nextLabel.font = Font.boldSystemFont(9);
  nextLabel.textColor = new Color("#94a3b8");

  nextCard.addSpacer(4);

  if (next) {
    let nextCode = nextCard.addText(next.code ? `${next.code} ${next.name}` : next.name);
    nextCode.font = Font.boldSystemFont(11);
    nextCode.textColor = Color.white();
    nextCode.lineLimit = 2;

    nextCard.addSpacer();

    let dayStr = next.diffDays === 0 ? "วันนี้" : (next.diffDays === 1 ? "พรุ่งนี้" : THAI_DAYS[next.day]);
    let nextTime = nextCard.addText(`${dayStr} • ⏰ ${next.start} - ${next.end}`);
    nextTime.font = Font.mediumSystemFont(9);
    nextTime.textColor = new Color("#fbbf24");
    nextTime.lineLimit = 1;

    if (next.room) {
      let nextRoom = nextCard.addText(`📍 ห้อง ${next.room}`);
      nextRoom.font = Font.systemFont(9);
      nextRoom.textColor = new Color("#94a3b8");
      nextRoom.lineLimit = 1;
    }
  } else {
    nextCard.addSpacer();
    let noNext = nextCard.addText("ไม่มีข้อมูลคาบถัดไป");
    noNext.font = Font.systemFont(10);
    noNext.textColor = new Color("#64748b");
    nextCard.addSpacer();
  }

  // กล่อง 3: TASKS (กินพื้นที่ 1/4 ทางขวา แสดงเฉพาะเมื่อมีงาน)
  if (hasTasks) {
    let taskCard = mainRow.addStack();
    taskCard.layoutVertically();
    taskCard.backgroundColor = new Color("#131d2e");
    taskCard.cornerRadius = 12;
    taskCard.borderWidth = 1;
    taskCard.borderColor = new Color("#1e2e4a");
    taskCard.setPadding(8, 8, 8, 8);

    let taskHeader = taskCard.addStack();
    taskHeader.layoutHorizontally();
    let taskTitle = taskHeader.addText("TASKS");
    taskTitle.font = Font.boldSystemFont(9);
    taskTitle.textColor = new Color("#f59e0b");
    taskHeader.addSpacer();

    let taskCount = taskHeader.addText(String(tasks.length));
    taskCount.font = Font.boldSystemFont(9);
    taskCount.textColor = new Color("#fbbf24");

    taskCard.addSpacer(4);

    let displayTasks = tasks.slice(0, 2);
    for (let t of displayTasks) {
      let tRow = taskCard.addStack();
      tRow.layoutVertically();
      tRow.backgroundColor = new Color("#1a263c");
      tRow.cornerRadius = 6;
      tRow.setPadding(3, 4, 3, 4);

      let tText = tRow.addText(t.title);
      tText.font = Font.mediumSystemFont(8);
      tText.textColor = Color.white();
      tText.lineLimit = 1;

      if (t.date) {
        let tDate = tRow.addText(t.badge ? `[${t.badge}] ${t.date.slice(5)}` : t.date.slice(5));
        tDate.font = Font.systemFont(7);
        tDate.textColor = new Color(t.color || "#38bdf8");
      }

      taskCard.addSpacer(2);
    }
  }
}

// Small Widget (2x2)
function renderSmallWidget(widget, current, next) {
  let body = widget.addStack();
  body.layoutVertically();
  body.spacing = 4;

  let curHeader = body.addText(current ? "🟢 กำลังเรียน" : "⚪ ไม่มีเรียนขณะนี้");
  curHeader.font = Font.boldSystemFont(9);
  curHeader.textColor = current ? new Color("#34d399") : new Color("#94a3b8");

  if (current) {
    let curTitle = body.addText(`${current.code} ${current.name}`);
    curTitle.font = Font.boldSystemFont(10);
    curTitle.textColor = Color.white();
    curTitle.lineLimit = 1;

    let curTime = body.addText(`⏰ ${current.start}-${current.end} · ${current.room || ""}`);
    curTime.font = Font.systemFont(8);
    curTime.textColor = new Color("#94a3b8");
  } else {
    let free = body.addText("มีเวลาพักผ่อน");
    free.font = Font.systemFont(9);
    free.textColor = new Color("#64748b");
  }

  body.addSpacer(4);

  let nextHeader = body.addText("🟡 คาบถัดไป");
  nextHeader.font = Font.boldSystemFont(9);
  nextHeader.textColor = new Color("#fbbf24");

  if (next) {
    let nextTitle = body.addText(`${next.code} ${next.name}`);
    nextTitle.font = Font.boldSystemFont(10);
    nextTitle.textColor = Color.white();
    nextTitle.lineLimit = 1;

    let dayStr = next.diffDays === 0 ? "วันนี้" : THAI_DAYS[next.day];
    let nextTime = body.addText(`${dayStr} ${next.start} · ${next.room || ""}`);
    nextTime.font = Font.systemFont(8);
    nextTime.textColor = new Color("#94a3b8");
  } else {
    let noNext = body.addText("ไม่มีข้อมูล");
    noNext.font = Font.systemFont(9);
    noNext.textColor = new Color("#64748b");
  }
}

// Large Widget (4x4)
function renderLargeWidget(widget, current, next, tasks, sessions, now) {
  renderMediumWidget(widget, current, next, tasks);

  widget.addSpacer(10);

  let listHeader = widget.addText("ตารางเรียนวันนี้ทั้งหมด");
  listHeader.font = Font.boldSystemFont(11);
  listHeader.textColor = new Color("#e2e8f0");

  widget.addSpacer(4);

  let todaySessions = sessions.filter(s => s.day === now.getDay());
  todaySessions.sort((a, b) => a.start.localeCompare(b.start));

  if (todaySessions.length === 0) {
    let empty = widget.addText("วันนี้ไม่มีคาบเรียน พักผ่อนได้เต็มที่ 🎉");
    empty.font = Font.systemFont(10);
    empty.textColor = new Color("#64748b");
  } else {
    for (let s of todaySessions.slice(0, 4)) {
      let row = widget.addStack();
      row.layoutHorizontally();
      row.backgroundColor = new Color("#131d2e");
      row.cornerRadius = 8;
      row.setPadding(4, 8, 4, 8);

      let time = row.addText(`${s.start}-${s.end}`);
      time.font = Font.mediumSystemFont(9);
      time.textColor = new Color("#38bdf8");

      row.addSpacer(8);

      let title = row.addText(`${s.code} ${s.name}`);
      title.font = Font.systemFont(9);
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
