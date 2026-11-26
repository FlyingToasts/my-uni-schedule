// Variables used to start the script:
// Widget Settings:
// - Script: SmartSchedule
// - Parameter (optional): URL to your schedule JSON or leave empty to use synced/embedded data.

/**
 * Smart Schedule iOS Widget (Scriptable)
 * รองรับหลายขนาดอัตโนมัติ (Small 2×2 / Medium 4×2 / Large 4×4 / Lock Screen)
 * รูปแบบและตรรกะตรงกับ Android Widget:
 * - Exam Mode (สัปดาห์สอบโทนส้ม) + Progress Bar + นับถอยหลังเข้า/เลิกเรียน
 * - เรียงลำดับงานตามความเร่งด่วน (เลยกำหนด -> วันนี้ -> พรุ่งนี้ -> วันถัดไป) + ความสำคัญ
 * - แสดงตารางวันนี้ (ในขนาด Large) และไฮไลต์งานด่วนสีแดงชมพู
 */

// --- CONFIGURATION ---
const APP_URL = "https://flyingtoasts.github.io/my-uni-schedule/"; // URL ของเว็บแอปเพื่อเปิดเมื่อแตะ Widget
const SYNC_URL = ""; // URL ซิงก์อัตโนมัติจาก Firebase Cloud Sync (เว็บแอปจะเติมให้อัตโนมัติเมื่อเข้าสู่ระบบ)
const REMOTE_DATA_URL = (args.widgetParameter || SYNC_URL || "").trim(); // รองรับทั้งซิงก์คลาวด์อัตโนมัติ หรือ URL ในช่อง Parameter

// ข้อมูลเริ่มต้น (จะถูกแทนที่ด้วยข้อมูลจริงของผู้ใช้เมื่อกดจากในเว็บแอป)
const DEFAULT_PAYLOAD = {
  "updatedAt": new Date().toISOString(),
  "examWeekDates": [],
  "sessions": [
    {
      "day": 1,
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
      "day": 2,
      "start": "10:00",
      "end": "12:00",
      "code": "2304104",
      "name": "GEN PHYS II",
      "room": "PHYS1 212",
      "color": "#818cf8"
    }
  ],
  "tasks": [
    { "title": "ส่งแบบฝึกหัดเขียนแบบ", "date": "2026-11-26", "type": "homework", "badge": "ส่งงาน", "color": "#f59e0b" },
    { "title": "อ่านสอบกลางภาค Phys II", "date": "2026-11-28", "type": "exam", "badge": "สอบกลางภาค", "color": "#f43f5e" }
  ],
  "exams": []
};

// --- DATA FETCHING & CACHE ---
const fm = FileManager.local();
const cacheDir = fm.documentsDirectory();
const cacheFile = fm.joinPath(cacheDir, "smart_schedule_ios_cache.json");

function extractWidgetPayload(data) {
  if (!data || typeof data !== "object" || data.error) return null;
  if (data.fields && data.fields.payloadJson && typeof data.fields.payloadJson.stringValue === "string") {
    try {
      let parsed = JSON.parse(data.fields.payloadJson.stringValue);
      if (parsed && (Array.isArray(parsed.sessions) || Array.isArray(parsed.scheduleData))) {
        return parsed;
      }
    } catch (e) {
      return null;
    }
    return null;
  }
  if (Array.isArray(data.sessions) || Array.isArray(data.scheduleData)) {
    return data;
  }
  return null;
}

function parseUpdatedAtMs(obj) {
  if (!obj || typeof obj !== "object") return 0;
  let iso = obj.updatedAt || obj.generatedAt || "";
  if (!iso) return 0;
  let ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

async function loadSchedulePayload() {
  let url = REMOTE_DATA_URL;
  if (url) {
    try {
      let req = new Request(url);
      req.timeoutInterval = 8;
      req.headers = { "Cache-Control": "no-cache" };
      let raw = await req.loadJSON();
      let parsed = extractWidgetPayload(raw);
      if (parsed) {
        try {
          fm.writeString(cacheFile, JSON.stringify(parsed));
        } catch (writeErr) {}
        return parsed;
      }
    } catch (e) {
      console.warn("Could not load from remote URL, trying local cache: " + e);
    }
  }

  let cached = null;
  if (fm.fileExists(cacheFile)) {
    try {
      let rawCache = JSON.parse(fm.readString(cacheFile));
      let parsedCache = extractWidgetPayload(rawCache);
      if (parsedCache) cached = parsedCache;
    } catch (e) {}
  }

  if (cached) {
    let cachedMs = parseUpdatedAtMs(cached);
    let defaultMs = parseUpdatedAtMs(DEFAULT_PAYLOAD);
    if (cachedMs > defaultMs || (url && cachedMs === defaultMs)) {
      return cached;
    }
  }

  return DEFAULT_PAYLOAD;
}

// --- TIME & SCHEDULE HELPERS ---
const THAI_DAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MAX_DAY_ROWS = 5;

function getBangkokNow() {
  return new Date();
}

function toIsoDate(d) {
  let y = d.getFullYear();
  let m = String(d.getMonth() + 1).padStart(2, "0");
  let day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysToDate(d, offset) {
  let copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + offset);
  return copy;
}

function formatThaiDisplayDate(dateStr) {
  if (!dateStr) return "";
  let parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  let d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return dateStr;
  return `${THAI_DAYS_SHORT[d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`;
}

function formatThaiShortDate(dateStr) {
  if (!dateStr) return "";
  let parts = dateStr.split("-");
  if (parts.length >= 3) {
    let day = parseInt(parts[2], 10);
    let month = parseInt(parts[1], 10);
    if (!isNaN(day) && !isNaN(month) && month >= 1 && month <= 12) {
      return `${day} ${THAI_MONTHS[month - 1]}`;
    }
  }
  return dateStr.slice(5);
}

function toMinutes(hhmm) {
  if (!hhmm) return -1;
  let p = String(hhmm).split(":");
  if (p.length < 2) return -1;
  let h = parseInt(p[0].trim(), 10);
  let m = parseInt(p[1].trim().slice(0, 2), 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

function minutesBetween(fromStr, toStr) {
  let a = toMinutes(fromStr);
  let b = toMinutes(toStr);
  if (a < 0 || b < 0) return -1;
  return b - a;
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} นาที`;
  let h = Math.floor(minutes / 60);
  let m = minutes % 60;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} น.`;
}

function taskImportanceRank(type, title) {
  let ty = String(type || "").trim().toLowerCase();
  let ti = String(title || "").trim().toLowerCase();
  if (
    ty === "exam" || ty === "midterm" || ty === "final" ||
    ti.includes("สอบ") || ti.includes("exam") || ti.includes("midterm") ||
    ti.includes("final") || ti.includes("พรีเซนต์") || ti.includes("present")
  ) return 0;
  if (
    ty === "quiz" ||
    ti.includes("quiz") || ti.includes("ควิซ") || ti.includes("test") || ti.includes("ทดสอบ")
  ) return 1;
  if (
    ty === "project" || ty === "lab" || ty === "report" ||
    ti.includes("โปรเจกต์") || ti.includes("project") ||
    ti.includes("รายงาน") || ti.includes("report") ||
    ti.includes("แลป") || ti.includes("lab")
  ) return 2;
  if (
    ty === "homework" || ty === "assignment" ||
    ti.includes("การบ้าน") || ti.includes("homework") ||
    ti.includes("ส่งงาน") || ti.includes("งาน")
  ) return 3;
  return 4;
}

function normalizePayload(raw, now) {
  let datedSessions = [];
  let recurringSessions = [];
  let tasks = [];
  let examWeekDates = Array.isArray(raw && raw.examWeekDates)
    ? raw.examWeekDates.filter(s => typeof s === "string" && s.length > 0)
    : [];

  if (raw && Array.isArray(raw.sessions)) {
    raw.sessions.forEach(s => {
      if (!s || !s.start || !s.end) return;
      if (s.date) {
        datedSessions.push({
          date: s.date,
          start: s.start,
          end: s.end,
          code: s.code || "",
          name: s.name || "",
          room: s.room || "",
          kind: s.kind || "class",
          label: s.label || ""
        });
      } else if (s.day !== undefined) {
        recurringSessions.push({
          day: Number(s.day),
          start: s.start,
          end: s.end,
          code: s.code || "",
          name: s.name || "",
          room: s.room || "",
          kind: s.kind || "class"
        });
      }
    });
  }

  if (raw && Array.isArray(raw.tasks)) {
    raw.tasks.forEach(t => {
      if (!t) return;
      tasks.push({
        title: t.title || "งาน",
        date: t.date || "",
        type: t.type || (t.badge && String(t.badge).includes("สอบ") ? "exam" : "homework")
      });
    });
  }

  if (raw && Array.isArray(raw.exams)) {
    raw.exams.forEach(ex => {
      if (ex && ex.date && ex.start) {
        datedSessions.push({
          date: ex.date,
          start: ex.start,
          end: ex.end || ex.start,
          code: ex.code || "",
          name: ex.name || "",
          room: ex.room || "",
          kind: "exam"
        });
      }
    });
  }

  // รองรับ payload ดั้งเดิมจาก scheduleData โดยตรง
  if (raw && Array.isArray(raw.scheduleData)) {
    raw.scheduleData.forEach(c => {
      if (c.day !== undefined && c.start && c.end) {
        recurringSessions.push({
          day: Number(c.day),
          start: c.start,
          end: c.end,
          code: c.code || "",
          name: c.name || "",
          room: c.room || "",
          kind: c.specialType === "lab" ? "lab" : "class"
        });
      }
      if (Array.isArray(c.extraSessions)) {
        c.extraSessions.forEach(ex => {
          if (ex.day !== undefined && ex.start && ex.end) {
            recurringSessions.push({
              day: Number(ex.day),
              start: ex.start,
              end: ex.end,
              code: c.code || "",
              name: c.name || "",
              room: ex.room || c.room || "",
              kind: c.specialType === "lab" ? "lab" : "class"
            });
          }
        });
      }
      if (Array.isArray(c.notes)) {
        c.notes.forEach(n => {
          if (n && !n.done && n.date && n.type !== "permanent" && n.type !== "cancel") {
            tasks.push({
              title: n.text || ("งาน " + (c.code || c.name)),
              date: n.date,
              type: n.type || "homework"
            });
          }
        });
      }
      if (c.exams) {
        ["midterm", "final"].forEach(t => {
          let ex = c.exams[t];
          if (ex && ex.date && ex.start) {
            datedSessions.push({
              date: ex.date,
              start: ex.start,
              end: ex.end || ex.start,
              code: c.code || "",
              name: c.name || "",
              room: ex.room || "",
              kind: "exam"
            });
          }
        });
      }
    });
  }

  // กรณีไม่มีข้อมูลคาบเรียนล่วงหน้าแล้ว (เช่น ออฟไลน์เกิน 14 วัน) ให้สร้างจากคาบประจำสัปดาห์สำรอง
  let todayIso = toIsoDate(now);
  let hasUpcomingOrTodayDated = datedSessions.some(s => s && s.date && s.date >= todayIso);
  if (!hasUpcomingOrTodayDated && raw && Array.isArray(raw.fallbackRecurringSessions)) {
    raw.fallbackRecurringSessions.forEach(rs => {
      if (rs && rs.day !== undefined && rs.start && rs.end) {
        recurringSessions.push({
          day: Number(rs.day),
          start: rs.start,
          end: rs.end,
          code: rs.code || "",
          name: rs.name || "",
          room: rs.room || "",
          kind: rs.kind || "class"
        });
      }
    });
  }

  // แปลงคาบประจำสัปดาห์ (day) เป็นวันที่ล่วงหน้า 14 วัน เพื่อให้คำนวณสอดคล้องกับ Android
  if (recurringSessions.length > 0) {
    for (let offset = 0; offset < 14; offset++) {
      let d = addDaysToDate(now, offset);
      let dIso = toIsoDate(d);
      let dow = d.getDay();
      recurringSessions.forEach(rs => {
        if (rs.day === dow) {
          datedSessions.push({
            date: dIso,
            start: rs.start,
            end: rs.end,
            code: rs.code,
            name: rs.name,
            room: rs.room,
            kind: rs.kind || "class"
          });
        }
      });
    }
  }

  datedSessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return { sessions: datedSessions, tasks, examWeekDates };
}

function examRoomPart(room) {
  let r = room ? (room.startsWith("ห้อง") || room === "ยังไม่ระบุห้องสอบ" ? room : `ห้อง ${room}`) : "ยังไม่ระบุห้องสอบ";
  return room && room !== "ยังไม่ระบุห้องสอบ" ? `📍 ${r}` : "⚠️ ยังไม่ระบุห้องสอบ";
}

function buildWidgetState(raw, now) {
  let { sessions, tasks, examWeekDates } = normalizePayload(raw, now);
  let today = toIsoDate(now);
  let tomorrow = toIsoDate(addDaysToDate(now, 1));
  let currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  let examDatesSet = new Set(examWeekDates);
  let hasExamToday = sessions.some(s => s.kind === "exam" && s.date === today);
  let examMode = examDatesSet.has(today) || hasExamToday;

  let pool = examMode ? sessions.filter(s => s.kind === "exam") : sessions;
  let current = null;
  let next = null;

  for (let item of pool) {
    if (item.date === today && currentTime >= item.start && currentTime < item.end) {
      current = item;
    }
    if (!next && (item.date > today || (item.date === today && item.start > currentTime))) {
      next = item;
    }
  }

  let todayPool = pool.filter(s => s.date === today);

  function dateLabelOf(date) {
    return date === today ? "วันนี้" : formatThaiDisplayDate(date);
  }

  function whenLabelOf(date, start) {
    if (date === today && start) {
      let m = minutesBetween(currentTime, start);
      return m > 0 ? `อีก ${formatDuration(m)}` : "วันนี้";
    }
    if (date === tomorrow) return "พรุ่งนี้";
    return dateLabelOf(date);
  }

  let ui = {
    examMode,
    dateText: formatThaiDisplayDate(today),
    curLabel: examMode ? "CURRENT EXAM" : "CURRENT CLASS",
    curLabelColor: examMode ? "#FB923C" : "#67E8F9",
    nextLabel: examMode ? "NEXT EXAM" : "NEXT CLASS",
    nextLabelColor: examMode ? "#FB923C" : "#93C5FD",
    hasCurrent: Boolean(current),
    hasNext: Boolean(next),
    curStatus: "",
    curStatusColor: "",
    curCode: "",
    curCodeColor: examMode ? "#FDBA74" : "#67E8F9",
    curName: "",
    curNameColor: examMode ? "#FFF7ED" : "#F8FAFC",
    curMeta: "",
    curMetaColor: "",
    curAccent: "#475569",
    curProgress: -1,
    curCountdown: "",
    nextCode: "",
    nextStart: "",
    nextWhen: "",
    nextName: "",
    nextNameColor: examMode ? "#FFF7ED" : "#F1F5F9",
    nextMeta: "",
    nextMetaColor: "",
    nextAccent: examMode ? "#FDBA74" : "#60A5FA",
    todayTitle: examMode ? "ตารางสอบวันนี้" : "ตารางวันนี้",
    todayEmpty: examMode ? "ไม่มีการสอบวันนี้ 📚" : "ไม่มีคาบเรียนวันนี้ 🎉",
    todayTotal: todayPool.length,
    todayRows: [],
    tasks: []
  };

  if (examMode) {
    if (current) {
      ui.curStatus = "● EXAM";
      ui.curStatusColor = "#F97316";
      ui.curCode = current.code || "EXAM";
      ui.curName = current.name || "วิชาสอบ";
      ui.curMeta = `⏰ ${current.start} - ${current.end} • ${examRoomPart(current.room)}`;
      ui.curMetaColor = "#FDE047";
      ui.curAccent = "#F97316";
    } else {
      ui.curStatus = "○ EXAM";
      ui.curStatusColor = "#FDBA74";
      ui.curAccent = "#9A3412";
      let firstStart = todayPool.length > 0 ? todayPool[0].start : "";
      let lastEnd = todayPool.length > 0 ? todayPool[todayPool.length - 1].end : "";
      if (todayPool.length === 0) {
        ui.curName = "ไม่มีการสอบในวันนี้";
        ui.curMeta = "อยู่ในช่วงสอบ • พักผ่อนหรืออ่านหนังสือสอบ 📚";
      } else if (currentTime < firstStart) {
        ui.curName = "ยังไม่ถึงเวลาสอบ";
        ui.curMeta = "เตรียมตัวก่อนเข้าห้องสอบ ✍️";
      } else if (currentTime >= lastEnd) {
        ui.curName = "การสอบวันนี้เสร็จสิ้นแล้ว";
        ui.curMeta = "สอบเสร็จแล้ว • พักผ่อนได้เต็มที่ 🎉";
      } else {
        ui.curName = "ไม่มีการสอบในขณะนี้";
        ui.curMeta = "ช่วงพักระหว่างวิชาสอบ • ทบทวนหนังสือ 📚";
      }
      ui.curMetaColor = "#FDBA74";
    }

    if (next) {
      ui.nextCode = next.code || "";
      ui.nextStart = next.start || "";
      ui.nextWhen = whenLabelOf(next.date, next.start);
      let nName = next.name || "วิชาสอบถัดไป";
      ui.nextName = next.code ? `${next.code}  ${nName}` : nName;
      let timeStr = next.end ? `${next.start} - ${next.end}` : next.start;
      let timePart = next.start ? `⏰ ${timeStr} • ` : "";
      ui.nextMeta = `${timePart}${examRoomPart(next.room)} • ${dateLabelOf(next.date)}`;
      ui.nextMetaColor = "#FED7AA";
    } else {
      ui.nextName = "ไม่มีวิชาสอบถัดไป";
      ui.nextNameColor = "#FED7AA";
      ui.nextMeta = "ไม่มีตารางสอบที่เหลืออยู่";
      ui.nextMetaColor = "#FED7AA";
    }
  } else {
    if (current) {
      let rText = current.room ? (current.room.startsWith("ห้อง") ? current.room : `ห้อง ${current.room}`) : "ยังไม่ระบุห้อง";
      ui.curStatus = "● LIVE";
      ui.curStatusColor = "#4ADE80";
      ui.curCode = current.code || "CLASS";
      ui.curName = current.name || "ไม่ระบุชื่อวิชา";
      ui.curMeta = `⏰ ${current.start} - ${current.end} • 📍 ${rText}`;
      ui.curMetaColor = "#BAE6FD";
      ui.curAccent = "#22D3EE";
    } else {
      ui.curStatus = "○ FREE";
      ui.curStatusColor = "#67E8F9";
      ui.curAccent = "#475569";
      let firstStart = todayPool.length > 0 ? todayPool[0].start : "";
      let lastEnd = todayPool.length > 0 ? todayPool[todayPool.length - 1].end : "";
      if (todayPool.length === 0) {
        ui.curName = "ไม่มีคาบเรียนในวันนี้";
        ui.curMeta = "วันว่าง • พักผ่อนได้เต็มที่ 🎉";
      } else if (currentTime < firstStart) {
        ui.curName = "ยังไม่ถึงเวลาเรียน";
        ui.curMeta = "ช่วงเวลาว่าง • มีเวลาเตรียมตัว 🎒";
      } else if (currentTime >= lastEnd) {
        ui.curName = "การเรียนวันนี้เสร็จสิ้นแล้ว";
        ui.curMeta = "เลิกเรียนแล้ว • พักผ่อนได้เต็มที่ 🎉";
      } else {
        ui.curName = "ไม่มีคาบเรียนในขณะนี้";
        ui.curMeta = "ช่วงเวลาพัก • พักผ่อนได้เต็มที่ 🎉";
      }
      ui.curMetaColor = "#BAE6FD";
    }

    if (next) {
      ui.nextCode = next.code || "";
      ui.nextStart = next.start || "";
      ui.nextWhen = whenLabelOf(next.date, next.start);
      let nName = next.name || "ไม่ระบุชื่อวิชา";
      ui.nextName = next.code ? `${next.code}  ${nName}` : nName;
      let timeStr = next.end ? `${next.start} - ${next.end}` : next.start;
      let rText = next.room ? (next.room.startsWith("ห้อง") ? next.room : `ห้อง ${next.room}`) : "";
      let roomPart = rText ? ` • 📍 ${rText}` : "";
      ui.nextMeta = `⏰ ${timeStr}${roomPart} • ${dateLabelOf(next.date)}`;
      ui.nextMetaColor = "#93C5FD";
    } else {
      ui.nextName = "ไม่มีคาบเรียนถัดไป";
      ui.nextNameColor = "#93C5FD";
      ui.nextMeta = "ไม่มีคาบเรียนแล้วในสัปดาห์นี้ • พักผ่อนได้เต็มที่ 🎉";
      ui.nextMetaColor = "#94A3B8";
    }
  }

  // Progress และเวลานับถอยหลังของคาบปัจจุบัน
  if (current) {
    let s = toMinutes(current.start);
    let e = toMinutes(current.end);
    let n = toMinutes(currentTime);
    if (s >= 0 && e > s && n >= 0) {
      ui.curProgress = Math.max(0, Math.min(100, Math.floor(((n - s) * 100) / (e - s))));
      let left = e - n;
      if (left > 0) ui.curCountdown = `เหลือ ${formatDuration(left)}`;
    }
  }

  // ตารางวันนี้ (เลื่อนหน้าต่างให้เห็นคาบปัจจุบัน/ถัดไปเสมอ)
  let rows = todayPool.map(item => {
    let state = (item.end && currentTime >= item.end)
      ? "past"
      : (currentTime >= item.start && (!item.end || currentTime < item.end) ? "active" : "upcoming");
    let titleText = [item.code, item.name].filter(Boolean).join(" ") || "ไม่ระบุชื่อวิชา";
    return {
      time: item.end ? `${item.start}-${item.end}` : item.start,
      title: titleText,
      room: item.room || "",
      state
    };
  });
  let focusIdx = rows.findIndex(r => r.state !== "past");
  if (focusIdx < 0) focusIdx = rows.length;
  let startIdx = Math.max(0, Math.min(focusIdx - 1, Math.max(0, rows.length - MAX_DAY_ROWS)));
  ui.todayRows = rows.slice(startIdx, startIdx + MAX_DAY_ROWS);

  // เรียงลำดับงาน: ความเร่งด่วน -> กำหนดส่งใกล้สุด -> ความสำคัญ -> ชื่อ
  function urgencyRank(d) {
    if (!d) return 4;
    if (d < today) return 0;
    if (d === today) return 1;
    if (d === tomorrow) return 2;
    return 3;
  }

  let sortedTasks = tasks.slice().sort((a, b) => {
    let ua = urgencyRank(a.date);
    let ub = urgencyRank(b.date);
    if (ua !== ub) return ua - ub;
    let da = a.date || "9999-99-99";
    let db = b.date || "9999-99-99";
    if (da !== db) return da.localeCompare(db);
    let ia = taskImportanceRank(a.type, a.title);
    let ib = taskImportanceRank(b.type, b.title);
    if (ia !== ib) return ia - ib;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  ui.tasks = sortedTasks.map(t => {
    let due = "";
    if (t.date) {
      if (t.date < today) due = "เลยกำหนด";
      else if (t.date === today) due = "วันนี้";
      else if (t.date === tomorrow) due = "พรุ่งนี้";
      else due = formatThaiShortDate(t.date);
    }
    return {
      title: t.title || "งาน",
      due,
      urgent: Boolean(t.date && t.date <= tomorrow)
    };
  });

  return ui;
}

// --- DRAWING HELPERS ---
function drawProgressBar(percent, isExam) {
  if (typeof DrawContext === "undefined") return null;
  let w = 220;
  let h = 6;
  let ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  let bgPath = new Path();
  bgPath.addRoundedRect(new Rect(0, 0, w, h), 3, 3);
  ctx.addPath(bgPath);
  ctx.setFillColor(new Color("#FFFFFF", 0.16));
  ctx.fillPath();

  let fillW = Math.max(6, Math.round((w * Math.max(0, Math.min(100, percent))) / 100));
  let fgPath = new Path();
  fgPath.addRoundedRect(new Rect(0, 0, fillW, h), 3, 3);
  ctx.addPath(fgPath);
  ctx.setFillColor(new Color(isExam ? "#FB923C" : "#22D3EE"));
  ctx.fillPath();

  return ctx.getImage();
}

function addHeaderBar(widget, ui, compact = false) {
  let headerRow = widget.addStack();
  headerRow.layoutHorizontally();
  headerRow.centerAlignContent();

  let dot = headerRow.addText("● ");
  dot.font = Font.systemFont(compact ? 8 : 9);
  dot.textColor = new Color("#38BDF8");

  let appTitle = headerRow.addText("Smart Schedule");
  appTitle.font = Font.boldSystemFont(compact ? 9.5 : 10.5);
  appTitle.textColor = new Color("#E2E8F0");

  if (ui.examMode) {
    headerRow.addSpacer(5);
    let chip = headerRow.addStack();
    chip.backgroundColor = new Color("#FFFFFF", 0.12);
    chip.cornerRadius = 6;
    chip.setPadding(1, 5, 1, 5);
    let chipTxt = chip.addText("สัปดาห์สอบ");
    chipTxt.font = Font.boldSystemFont(7.5);
    chipTxt.textColor = new Color("#FDBA74");
  }

  headerRow.addSpacer();

  let dateText = headerRow.addText(ui.dateText);
  dateText.font = Font.mediumSystemFont(compact ? 9.5 : 10);
  dateText.textColor = new Color("#94A3B8");
}

function addCurrentCard(container, ui, compact = true) {
  let card = container.addStack();
  card.layoutHorizontally();
  card.backgroundColor = new Color(ui.examMode ? "#4A2310" : "#153A52", 0.9);
  card.cornerRadius = 11;
  card.borderWidth = 1;
  card.borderColor = new Color(ui.examMode ? "#FDBA74" : "#7DD3FC", ui.examMode ? 0.55 : 0.4);
  card.setPadding(compact ? 5 : 7, 7, compact ? 5 : 7, 8);

  let accent = card.addStack();
  accent.size = new Size(3, 0);
  accent.backgroundColor = new Color(ui.curAccent);
  accent.cornerRadius = 1.5;

  card.addSpacer(6);

  let body = card.addStack();
  body.layoutVertically();

  let top = body.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  let lbl = top.addText(ui.curLabel);
  lbl.font = Font.boldSystemFont(8);
  lbl.textColor = new Color(ui.curLabelColor);

  top.addSpacer();

  if (ui.curCountdown) {
    let cd = top.addText(ui.curCountdown);
    cd.font = Font.systemFont(8);
    cd.textColor = new Color("#CBD5E1");
    top.addSpacer(4);
  }

  let pill = top.addStack();
  pill.backgroundColor = new Color("#FFFFFF", 0.10);
  pill.cornerRadius = 6;
  pill.setPadding(1, 5, 1, 5);
  let badge = pill.addText(ui.curStatus);
  badge.font = Font.boldSystemFont(7.5);
  badge.textColor = new Color(ui.curStatusColor);

  body.addSpacer();

  let titleRow = body.addStack();
  titleRow.layoutHorizontally();
  titleRow.centerAlignContent();
  if (ui.curCode) {
    let codeTxt = titleRow.addText(ui.curCode + " ");
    codeTxt.font = Font.boldSystemFont(compact ? 10.5 : 11.5);
    codeTxt.textColor = new Color(ui.curCodeColor);
  }
  let nameTxt = titleRow.addText(ui.curName);
  nameTxt.font = Font.boldSystemFont(compact ? 11.5 : 12.5);
  nameTxt.textColor = new Color(ui.curNameColor);
  nameTxt.lineLimit = 1;

  body.addSpacer(2);

  let metaTxt = body.addText(ui.curMeta);
  metaTxt.font = Font.mediumSystemFont(compact ? 9 : 10);
  metaTxt.textColor = new Color(ui.curMetaColor);
  metaTxt.lineLimit = 1;

  body.addSpacer();

  if (ui.curProgress >= 0) {
    let barImg = drawProgressBar(ui.curProgress, ui.examMode);
    if (barImg) {
      let img = body.addImage(barImg);
      img.imageSize = new Size(compact ? 175 : 290, 3.5);
    }
  }
}

function addNextCard(container, ui, compact = true) {
  let card = container.addStack();
  card.layoutHorizontally();
  card.backgroundColor = new Color(ui.examMode ? "#401A0C" : "#1E2F4A", 0.9);
  card.cornerRadius = 11;
  card.borderWidth = 1;
  card.borderColor = new Color(ui.examMode ? "#FDBA74" : "#93C5FD", ui.examMode ? 0.55 : 0.35);
  card.setPadding(compact ? 5 : 6, 7, compact ? 5 : 6, 8);

  let accent = card.addStack();
  accent.size = new Size(3, 0);
  accent.backgroundColor = new Color(ui.nextAccent);
  accent.cornerRadius = 1.5;

  card.addSpacer(6);

  let body = card.addStack();
  body.layoutVertically();

  let top = body.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  let lbl = top.addText(ui.nextLabel);
  lbl.font = Font.boldSystemFont(8);
  lbl.textColor = new Color(ui.nextLabelColor);

  top.addSpacer();

  if (ui.nextWhen) {
    let whenTxt = top.addText(ui.nextWhen);
    whenTxt.font = Font.boldSystemFont(8);
    whenTxt.textColor = new Color("#BFDBFE");
  }

  body.addSpacer();

  let nameTxt = body.addText(ui.nextName);
  nameTxt.font = Font.boldSystemFont(compact ? 11.5 : 12);
  nameTxt.textColor = new Color(ui.nextNameColor);
  nameTxt.lineLimit = 1;

  body.addSpacer(2);

  let metaTxt = body.addText(ui.nextMeta);
  metaTxt.font = Font.mediumSystemFont(compact ? 9 : 9.5);
  metaTxt.textColor = new Color(ui.nextMetaColor);
  metaTxt.lineLimit = 1;

  body.addSpacer();
}

function addTasksColumn(parent, ui, options) {
  let { slots, width, horizontalRows, hideEmpty } = options;
  let tasks = ui.tasks;
  if (tasks.length === 0 && hideEmpty) return;

  let taskBox = parent.addStack();
  taskBox.layoutVertically();
  taskBox.backgroundColor = new Color("#2A1A44", 0.9);
  taskBox.cornerRadius = 11;
  taskBox.borderWidth = 1;
  taskBox.borderColor = new Color("#D8B4FE", 0.4);
  taskBox.setPadding(6, 6, 6, 6);
  if (width > 0) taskBox.size = new Size(width, 0);

  let taskHeader = taskBox.addStack();
  taskHeader.layoutHorizontally();
  taskHeader.centerAlignContent();

  let taskTitle = taskHeader.addText("TASKS");
  taskTitle.font = Font.boldSystemFont(8);
  taskTitle.textColor = new Color("#C084FC");

  taskHeader.addSpacer();

  let taskCount = taskHeader.addText(`${tasks.length} งาน`);
  taskCount.font = Font.boldSystemFont(8);
  taskCount.textColor = new Color("#E9D5FF");

  if (tasks.length === 0) {
    taskBox.addSpacer();
    let emptyTxt = taskBox.addText("ไม่มีงานค้าง 🎉");
    emptyTxt.font = Font.systemFont(9.5);
    emptyTxt.textColor = new Color("#C4B5FD");
    emptyTxt.centerAlignText();
    taskBox.addSpacer();
    return;
  }

  let countToRender = Math.min(tasks.length, slots);
  let compactSingleLine = !horizontalRows && tasks.length >= slots;

  taskBox.addSpacer(3);

  for (let i = 0; i < countToRender; i++) {
    let isOverflow = i === slots - 1 && tasks.length > slots;
    let itemCard = taskBox.addStack();
    itemCard.cornerRadius = 6;
    itemCard.borderWidth = 1;

    if (isOverflow) {
      itemCard.layoutHorizontally();
      itemCard.centerAlignContent();
      itemCard.backgroundColor = new Color("#241C38");
      itemCard.borderColor = new Color("#403260");
      itemCard.setPadding(horizontalRows ? 4 : 3, 5, horizontalRows ? 4 : 3, 5);
      let rem = tasks.length - (slots - 1);
      let moreTxt = itemCard.addText(`+ อีก ${rem} งาน...`);
      moreTxt.font = Font.mediumSystemFont(8);
      moreTxt.textColor = new Color("#E9D5FF");
      moreTxt.lineLimit = 1;
      itemCard.addSpacer();
    } else {
      let t = tasks[i];
      itemCard.backgroundColor = new Color(t.urgent ? "#3A1A2A" : "#241C38");
      itemCard.borderColor = new Color(t.urgent ? "#F43F5E" : "#403260", t.urgent ? 0.6 : 1.0);

      if (horizontalRows) {
        itemCard.layoutHorizontally();
        itemCard.centerAlignContent();
        itemCard.setPadding(4, 5, 4, 5);

        let titleTxt = itemCard.addText(t.title);
        titleTxt.font = Font.mediumSystemFont(8.5);
        titleTxt.textColor = new Color("#F1F5F9");
        titleTxt.lineLimit = 1;

        itemCard.addSpacer();

        if (t.due) {
          let dueTxt = itemCard.addText(t.due);
          dueTxt.font = Font.boldSystemFont(7.5);
          dueTxt.textColor = new Color(t.urgent ? "#FDA4AF" : "#C4B5FD");
          dueTxt.lineLimit = 1;
        }
      } else if (compactSingleLine) {
        itemCard.layoutHorizontally();
        itemCard.centerAlignContent();
        itemCard.setPadding(3, 5, 3, 5);
        let line = t.due ? `${t.title} · ${t.due}` : t.title;
        let lineTxt = itemCard.addText(line);
        lineTxt.font = Font.mediumSystemFont(7.5);
        lineTxt.textColor = new Color(t.urgent ? "#FDA4AF" : "#F1F5F9");
        lineTxt.lineLimit = 1;
        itemCard.addSpacer();
      } else {
        itemCard.layoutVertically();
        itemCard.setPadding(4, 5, 4, 5);
        itemCard.addSpacer();

        let titleTxt = itemCard.addText(t.title);
        titleTxt.font = Font.mediumSystemFont(8);
        titleTxt.textColor = new Color("#F1F5F9");
        titleTxt.lineLimit = 2;

        if (t.due) {
          itemCard.addSpacer(1);
          let dueTxt = itemCard.addText(t.due);
          dueTxt.font = Font.boldSystemFont(7.5);
          dueTxt.textColor = new Color(t.urgent ? "#FDA4AF" : "#C4B5FD");
          dueTxt.lineLimit = 1;
        }
        itemCard.addSpacer();
      }
    }

    if (i < countToRender - 1) taskBox.addSpacer(3);
  }
  taskBox.addSpacer();
}

// --- WIDGET BUILDER ---
async function createWidget() {
  let raw = await loadSchedulePayload();
  let now = getBangkokNow();
  let ui = buildWidgetState(raw, now);

  let widget = new ListWidget();
  widget.backgroundColor = new Color("#0B1220");
  widget.url = APP_URL;
  widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

  let family = config.widgetFamily || "medium";

  if (family === "accessoryRectangular") {
    renderAccessoryRectangular(widget, ui);
  } else if (family === "accessoryInline") {
    renderAccessoryInline(widget, ui);
  } else if (family === "small") {
    widget.setPadding(10, 11, 10, 11);
    renderSmallWidget(widget, ui);
  } else if (family === "large") {
    widget.setPadding(10, 10, 10, 10);
    addHeaderBar(widget, ui, false);
    widget.addSpacer(5);
    renderLargeWidget(widget, ui);
  } else {
    widget.setPadding(8, 10, 8, 10);
    addHeaderBar(widget, ui, false);
    widget.addSpacer(5);
    renderMediumWidget(widget, ui);
  }

  return widget;
}

// Small Widget (2×2)
function renderSmallWidget(widget, ui) {
  let top = widget.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  let dot = top.addText("● ");
  dot.font = Font.systemFont(8);
  dot.textColor = new Color("#38BDF8");

  let dateTxt = top.addText(ui.dateText);
  dateTxt.font = Font.boldSystemFont(9);
  dateTxt.textColor = new Color("#CBD5E1");
  dateTxt.lineLimit = 1;

  top.addSpacer();

  let pill = top.addStack();
  pill.backgroundColor = new Color("#FFFFFF", 0.10);
  pill.cornerRadius = 6;
  pill.setPadding(1, 5, 1, 5);
  let statusTxt = pill.addText(ui.curStatus);
  statusTxt.font = Font.boldSystemFont(7.5);
  statusTxt.textColor = new Color(ui.curStatusColor);

  widget.addSpacer();

  let focusNext = !ui.hasCurrent && ui.hasNext;
  let main = widget.addStack();
  main.layoutHorizontally();

  let accent = main.addStack();
  accent.size = new Size(3, 0);
  accent.backgroundColor = new Color(focusNext ? ui.nextAccent : ui.curAccent);
  accent.cornerRadius = 1.5;

  main.addSpacer(6);

  let col = main.addStack();
  col.layoutVertically();

  let labelText = focusNext
    ? (ui.nextWhen ? `${ui.nextLabel} · ${ui.nextWhen}` : ui.nextLabel)
    : (ui.curCountdown ? `${ui.curLabel} · ${ui.curCountdown}` : ui.curLabel);
  let lbl = col.addText(labelText);
  lbl.font = Font.boldSystemFont(8);
  lbl.textColor = new Color(focusNext ? ui.nextLabelColor : ui.curLabelColor);
  lbl.lineLimit = 1;

  if (!focusNext && ui.curCode) {
    col.addSpacer(2);
    let code = col.addText(ui.curCode);
    code.font = Font.boldSystemFont(10);
    code.textColor = new Color(ui.curCodeColor);
    code.lineLimit = 1;
  }

  col.addSpacer(2);

  let title = col.addText(focusNext ? ui.nextName : ui.curName);
  title.font = Font.boldSystemFont(12.5);
  title.textColor = new Color(focusNext ? ui.nextNameColor : ui.curNameColor);
  title.lineLimit = 2;

  col.addSpacer(2);

  let meta = col.addText(focusNext ? ui.nextMeta : ui.curMeta);
  meta.font = Font.systemFont(9);
  meta.textColor = new Color(focusNext ? ui.nextMetaColor : ui.curMetaColor);
  meta.lineLimit = 2;

  if (!focusNext && ui.curProgress >= 0) {
    let barImg = drawProgressBar(ui.curProgress, ui.examMode);
    if (barImg) {
      col.addSpacer(4);
      let img = col.addImage(barImg);
      img.imageSize = new Size(110, 3.5);
    }
  }

  widget.addSpacer();

  let footerText = "";
  if (ui.hasCurrent && ui.hasNext) {
    footerText = `ต่อไป ${ui.nextStart} • ${ui.nextCode || ui.nextName}`;
  } else if (ui.tasks.length > 0) {
    footerText = `📝 ${ui.tasks.length} งาน • ${ui.tasks[0].title}`;
  } else if (focusNext) {
    footerText = ui.curName;
  }

  if (footerText) {
    let footer = widget.addStack();
    footer.backgroundColor = new Color("#FFFFFF", 0.07);
    footer.cornerRadius = 7;
    footer.setPadding(3, 6, 3, 6);
    let fTxt = footer.addText(footerText);
    fTxt.font = Font.systemFont(8.5);
    fTxt.textColor = new Color("#CBD5E1");
    fTxt.lineLimit = 1;
    footer.addSpacer();
  }
}

// Medium Widget (4×2)
function renderMediumWidget(widget, ui) {
  let bodyRow = widget.addStack();
  bodyRow.layoutHorizontally();
  bodyRow.spacing = 6;

  let leftCol = bodyRow.addStack();
  leftCol.layoutVertically();
  leftCol.spacing = 4;

  addCurrentCard(leftCol, ui, true);
  addNextCard(leftCol, ui, true);

  addTasksColumn(bodyRow, ui, {
    slots: 3,
    width: 108,
    horizontalRows: false,
    hideEmpty: true
  });
}

// Large Widget (4×4)
function renderLargeWidget(widget, ui) {
  addCurrentCard(widget, ui, false);
  widget.addSpacer(5);
  addNextCard(widget, ui, false);
  widget.addSpacer(6);

  let bottomRow = widget.addStack();
  bottomRow.layoutHorizontally();
  bottomRow.spacing = 6;

  // ซ้าย: ตารางวันนี้
  let todayBox = bottomRow.addStack();
  todayBox.layoutVertically();
  todayBox.backgroundColor = new Color("#172234", 0.9);
  todayBox.cornerRadius = 11;
  todayBox.borderWidth = 1;
  todayBox.borderColor = new Color("#475569", 0.4);
  todayBox.setPadding(6, 6, 6, 6);

  let tHeader = todayBox.addStack();
  tHeader.layoutHorizontally();
  tHeader.centerAlignContent();

  let tTitle = tHeader.addText(ui.todayTitle);
  tTitle.font = Font.boldSystemFont(8.5);
  tTitle.textColor = new Color("#E2E8F0");

  tHeader.addSpacer();

  if (ui.todayTotal > 0) {
    let tCount = tHeader.addText(`${ui.todayTotal} ${ui.examMode ? "วิชา" : "คาบ"}`);
    tCount.font = Font.systemFont(8);
    tCount.textColor = new Color("#94A3B8");
  }

  if (ui.todayRows.length === 0) {
    todayBox.addSpacer();
    let empty = todayBox.addText(ui.todayEmpty);
    empty.font = Font.systemFont(9.5);
    empty.textColor = new Color("#94A3B8");
    empty.centerAlignText();
    todayBox.addSpacer();
  } else {
    todayBox.addSpacer(3);
    for (let i = 0; i < ui.todayRows.length; i++) {
      let row = ui.todayRows[i];
      let isAct = row.state === "active";
      let isPast = row.state === "past";

      let rowStack = todayBox.addStack();
      rowStack.layoutHorizontally();
      rowStack.centerAlignContent();
      rowStack.cornerRadius = 6;
      rowStack.setPadding(3, 5, 3, 5);
      if (isAct) {
        rowStack.backgroundColor = new Color(ui.examMode ? "#F97316" : "#22D3EE", 0.22);
        rowStack.borderWidth = 1;
        rowStack.borderColor = new Color(ui.examMode ? "#FB923C" : "#22D3EE", 0.55);
      } else {
        rowStack.backgroundColor = new Color("#FFFFFF", 0.06);
      }

      let timeTxt = rowStack.addText(row.time);
      timeTxt.font = Font.boldSystemFont(8);
      timeTxt.textColor = new Color(
        isAct ? (ui.examMode ? "#FDBA74" : "#67E8F9") : (isPast ? "#475569" : "#93C5FD")
      );
      timeTxt.lineLimit = 1;

      rowStack.addSpacer(4);

      let titleTxt = rowStack.addText(isAct ? `● ${row.title}` : row.title);
      titleTxt.font = Font.systemFont(8.5);
      titleTxt.textColor = isAct ? Color.white() : new Color(isPast ? "#64748B" : "#F1F5F9");
      titleTxt.lineLimit = 1;

      rowStack.addSpacer();

      if (row.room) {
        let roomTxt = rowStack.addText(row.room);
        roomTxt.font = Font.systemFont(7.5);
        roomTxt.textColor = new Color(isAct ? "#E2E8F0" : (isPast ? "#475569" : "#94A3B8"));
        roomTxt.lineLimit = 1;
      }

      if (i < ui.todayRows.length - 1) todayBox.addSpacer(2);
    }
    todayBox.addSpacer();
  }

  // ขวา: TASKS
  addTasksColumn(bottomRow, ui, {
    slots: 4,
    width: 132,
    horizontalRows: true,
    hideEmpty: false
  });
}

// Lock Screen Rectangular
function renderAccessoryRectangular(widget, ui) {
  widget.setPadding(2, 4, 2, 4);
  let focusNext = !ui.hasCurrent && ui.hasNext;
  let head = widget.addText(
    focusNext ? `${ui.nextLabel} · ${ui.nextWhen}` : `${ui.curLabel} ${ui.curStatus}`
  );
  head.font = Font.boldSystemFont(10);
  head.lineLimit = 1;

  let titleText = focusNext ? ui.nextName : (ui.curCode ? `${ui.curCode} ${ui.curName}` : ui.curName);
  let title = widget.addText(titleText);
  title.font = Font.boldSystemFont(12);
  title.lineLimit = 1;

  let meta = widget.addText(focusNext ? ui.nextMeta : ui.curMeta);
  meta.font = Font.systemFont(10);
  meta.textOpacity = 0.8;
  meta.lineLimit = 1;
}

// Lock Screen Inline
function renderAccessoryInline(widget, ui) {
  let msg = ui.hasCurrent
    ? `● ${ui.curCode || ui.curName} ${ui.curCountdown}`.trim()
    : (ui.hasNext ? `ถัดไป ${ui.nextStart} ${ui.nextCode || ui.nextName}`.trim() : "Smart Schedule · ว่าง");
  let t = widget.addText(msg);
  t.lineLimit = 1;
}

// --- RUN SCRIPT ---
(async () => {
  let widget = await createWidget();
  if (config.runsInWidget) {
    Script.setWidget(widget);
    Script.complete();
  } else {
    await widget.presentMedium();
  }
})();
