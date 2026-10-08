const KEY = "worklog.v1";
let shifts = [];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => "$" + n.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
const mins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const clock = t => { const [h, m] = t.split(":").map(Number); return ((h % 12) || 12) + ":" + String(m).padStart(2, "0") + (h < 12 ? " am" : " pm"); };
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const ddmmyyyy = s => s.split("-").reverse().join("/");
const serial = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000 + 25569; };

function load() { try { shifts = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { shifts = []; } }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(shifts)); return true; }
  catch (e) { alert("Could not save: browser storage is blocked or full."); return false; }
}
function calc(start, end, rate, brk, type) {
  const dur = ((mins(end) - mins(start)) % 1440 + 1440) % 1440;   // handles shifts past midnight
  const hrs = Math.round((dur - brk) / 60 * 100) / 100;
  return { dur, hrs, amt: Math.round((type === "fixed" ? rate : hrs * rate) * 100) / 100 };
}
const calcS = s => calc(s.start, s.end, s.rate, s.brk, s.type);
let payType = "hourly";
function setPayType(t) {
  payType = t;
  document.querySelectorAll("#ptype button").forEach(b => b.classList.toggle("on", b.dataset.v === t));
  $("rateLbl").textContent = t === "fixed" ? "Fixed amount ($)" : "Hourly rate ($)";
  preview();
}
$("ptype").addEventListener("click", ev => { if (ev.target.dataset.v) setPayType(ev.target.dataset.v); });
const providers = () => [...new Set(shifts.map(s => s.provider))].sort((a, b) => a.localeCompare(b));

/* ---------- Log form ---------- */
function validate() {
  const p = $("provider").value.trim(), s = $("start").value, e = $("end").value;
  const rate = parseFloat(($("rate").value || "").replace(",", ".")), brk = $("brk").value === "" ? 0 : parseInt($("brk").value, 10);
  if (!p) return { err: "Enter the provider.", f: "provider" };
  if (!s) return { err: "Enter the start time.", f: "start" };
  if (!e) return { err: "Enter the end time.", f: "end" };
  if (isNaN(rate) || rate < 0) return { err: payType === "fixed" ? "Enter the fixed amount." : "Enter the hourly rate.", f: "rate" };
  if (isNaN(brk) || brk < 0) return { err: "Enter the unpaid break in minutes (0 if none).", f: "brk" };
  const c = calc(s, e, rate, brk, payType);
  if (brk >= c.dur) return { err: "The unpaid break is as long as the whole shift.", f: "brk" };
  return { ok: true, p, s, e, rate, brk, c, type: payType };
}
function preview() {
  const v = validate();
  $("hrs").textContent = v.ok ? v.c.hrs : "–";
  $("amt").textContent = v.ok ? money(v.c.amt) : "–";
  $("err").textContent = "";
  $("msg").textContent = "";
}
$("provider").addEventListener("change", () => {
  const last = shifts.filter(s => s.provider.toLowerCase() === $("provider").value.trim().toLowerCase()).pop();
  if (last && !$("rate").value) { $("rate").value = last.rate; setPayType(last.type || "hourly"); }
  preview();
});
["provider", "start", "end", "rate", "brk"].forEach(id => ["input", "change", "blur", "keyup"].forEach(ev => $(id).addEventListener(ev, preview)));
$("save").addEventListener("click", () => {
  const v = validate();
  if (!v.ok) { $("err").textContent = v.err; $(v.f).focus(); return; }
  const known = providers().find(p => p.toLowerCase() === v.p.toLowerCase());
  shifts.push({
    id: Date.now() + "" + Math.floor(Math.random() * 1000),
    date: $("date").value || today(),
    provider: known || v.p, start: v.s, end: v.e, rate: v.rate, brk: v.brk, type: v.type, status: ""
  });
  if (!persist()) { shifts.pop(); return; }
  refreshProviders();
  ["provider", "start", "end", "rate"].forEach(id => $(id).value = "");
  $("brk").value = 0; $("date").value = today();
  $("hrs").textContent = $("amt").textContent = "–"; $("err").textContent = "";
  $("msg").textContent = "Saved: " + v.c.hrs + " hrs, " + money(v.c.amt) + ".";
});

/* ---------- History ---------- */
function refreshProviders() {
  const ps = providers(), cur = $("filter").value;
  $("plist").innerHTML = ps.map(p => `<option value="${esc(p)}">`).join("");
  $("filter").innerHTML = '<option value="">All providers</option>' + ps.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  if (ps.includes(cur)) $("filter").value = cur;
  const bc = $("bfilter").value;
  $("bfilter").innerHTML = $("filter").innerHTML;
  if (ps.includes(bc)) $("bfilter").value = bc;
}
const filtered = () => shifts.filter(s => !$("filter").value || s.provider === $("filter").value)
  .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
function renderHistory() {
  const list = filtered();
  let h = 0, e = 0, paid = 0;
  list.forEach(s => { const c = calcS(s); h += c.hrs; e += c.amt; if (s.status === "Paid") paid += c.amt; });
  $("tH").textContent = Math.round(h * 100) / 100;
  $("tE").textContent = money(e);
  $("tU").textContent = money(e - paid);
  $("list").innerHTML = list.length ? list.map(s => {
    const c = calcS(s);
    return `<div class="item" data-id="${s.id}">
      <div class="top"><b>${esc(s.provider)}</b><b>${money(c.amt)}</b></div>
      <div class="sub">${ddmmyyyy(s.date)}, ${clock(s.start)} to ${clock(s.end)}, ${c.hrs} hrs, ${s.type === "fixed" ? "fixed " + money(s.rate) : money(s.rate) + "/hr"}, ${s.brk} min break</div>
      <div class="bot">
        <select aria-label="Status" class="s-${s.status}">${["", "Pending", "Invoiced", "Paid"].map(o => `<option value="${o}"${o === s.status ? " selected" : ""}>${o || "Status: not set"}</option>`).join("")}</select>
        <button class="del">Delete</button>
      </div></div>`;
  }).join("") : '<div class="empty">No shifts yet. Log your first one on the Log shift tab.</div>';
}
$("filter").addEventListener("change", renderHistory);
$("list").addEventListener("change", ev => {
  const s = shifts.find(x => x.id === ev.target.closest(".item").dataset.id);
  if (s) { s.status = ev.target.value; persist(); renderHistory(); }
});
$("list").addEventListener("click", ev => {
  if (!ev.target.classList.contains("del")) return;
  if (!confirm("Delete this shift?")) return;
  shifts = shifts.filter(x => x.id !== ev.target.closest(".item").dataset.id);
  persist(); refreshProviders(); renderHistory();
});

/* ---------- Excel export ---------- */
function sheetFor(list) {
  const ws = {}, put = (r, c, o) => ws[XLSX.utils.encode_cell({ r, c })] = o;
  ["Date", "Provider", "Pay Type", "Start Time", "End Time", "Rate / Fixed Amount ($)", "Unpaid Break (min)", "Total Payable Hrs", "Payable Amount ($)", "Status"]
    .forEach((h, i) => put(0, i, { t: "s", v: h }));
  let th = 0, te = 0, tp = 0;
  list.forEach((x, i) => {
    const r = i + 1, R = r + 1, c = calcS(x);
    th += c.hrs; te += c.amt; if (x.status === "Paid") tp += c.amt;
    put(r, 0, { t: "n", v: serial(x.date), z: "dd/mm/yyyy" });
    put(r, 1, { t: "s", v: x.provider });
    put(r, 2, { t: "s", v: x.type === "fixed" ? "Fixed" : "Hourly" });
    put(r, 3, { t: "n", v: mins(x.start) / 1440, z: "h:mm AM/PM" });
    put(r, 4, { t: "n", v: mins(x.end) / 1440, z: "h:mm AM/PM" });
    put(r, 5, { t: "n", v: x.rate, z: "$#,##0.00" });
    put(r, 6, { t: "n", v: x.brk });
    put(r, 7, { t: "n", v: c.hrs, f: `ROUND(MOD(E${R}-D${R},1)*24-G${R}/60,2)`, z: "0.00" });
    put(r, 8, { t: "n", v: c.amt, f: `IF(C${R}="Fixed",F${R},ROUND(F${R}*H${R},2))`, z: "$#,##0.00" });
    put(r, 9, { t: "s", v: x.status || "" });
  });
  put(0, 11, { t: "s", v: "Total hours" });       put(0, 12, { t: "n", v: th, f: "SUM(H2:H2000)", z: "0.00" });
  put(1, 11, { t: "s", v: "Total earned ($)" });  put(1, 12, { t: "n", v: te, f: "SUM(I2:I2000)", z: "$#,##0.00" });
  put(2, 11, { t: "s", v: "Not yet paid ($)" });  put(2, 12, { t: "n", v: te - tp, f: 'SUM(I2:I2000)-SUMIF(J2:J2000,"Paid",I2:I2000)', z: "$#,##0.00" });
  put(3, 11, { t: "s", v: "Paid ($)" });         put(3, 12, { t: "n", v: tp, f: 'SUMIF(J2:J2000,"Paid",I2:I2000)', z: "$#,##0.00" });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(list.length, 3), c: 12 } });
  ws["!cols"] = [12, 22, 10, 12, 12, 22, 18, 16, 18, 12, 3, 18, 14].map(w => ({ wch: w }));
  return ws;
}
const byDate = list => list.slice().sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
const fname = p => p.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "_").toLowerCase() || "provider";
function exportFile(wb, name) { try { XLSX.writeFile(wb, name); } catch (e) { alert("Excel export failed. Check your internet connection (the Excel library loads online) and try again."); } }
$("xOne").addEventListener("click", () => {
  const p = $("filter").value;
  if (!p) return alert("Pick a provider in the list above first.");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFor(byDate(shifts.filter(s => s.provider === p))), "Shifts");
  exportFile(wb, fname(p) + ".xlsx");
});
$("xAll").addEventListener("click", () => {
  if (!shifts.length) return alert("Nothing to export yet.");
  const wb = XLSX.utils.book_new(), used = new Set();
  providers().forEach(p => {
    let n = p.replace(/[\\\/?*\[\]:]/g, "").slice(0, 28) || "Provider", k = 1, base = n;
    while (used.has(n.toLowerCase())) n = base + " " + (++k);
    used.add(n.toLowerCase());
    XLSX.utils.book_append_sheet(wb, sheetFor(byDate(shifts.filter(s => s.provider === p))), n);
  });
  exportFile(wb, "work_log_all.xlsx");
});

/* ---------- Backup / restore ---------- */
$("bak").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(shifts)], { type: "application/json" }));
  a.download = "work_log_backup_" + today() + ".json";
  a.click();
});
$("rst").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", ev => {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!Array.isArray(data)) throw 0;
      const have = new Set(shifts.map(s => s.id));
      const add = data.filter(s => s && s.id && s.provider && s.start && s.end && !have.has(s.id));
      shifts = shifts.concat(add); persist(); refreshProviders(); renderHistory();
      alert("Restored " + add.length + " shifts.");
    } catch (e) { alert("That file isn't a Work Log backup."); }
    ev.target.value = "";
  };
  r.readAsText(f);
});

/* ---------- Bundles (weekly / fortnightly / monthly) ---------- */
const SKEY = "worklog.settings.v1";
let settings = { period: "weekly", anchor: "" };
function loadSettings() { try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch (e) {} }
function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) {} }
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dnum = n => new Date((n - 25569) * 86400000);
const dlabel = (n, y) => { const d = dnum(n); return d.getUTCDate() + " " + MON[d.getUTCMonth()] + (y ? " " + d.getUTCFullYear() : ""); };
const toDateStr = n => { const d = dnum(n); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); };
const mondayOf = ds => { const n = serial(ds); return n - ((dnum(n).getUTCDay() + 6) % 7); };
const round2 = x => Math.round(x * 100) / 100;
function ensureAnchor() {
  if (settings.anchor) return;
  settings.anchor = toDateStr(mondayOf(shifts.map(s => s.date).sort()[0] || today()));
  saveSettings();
}
function periodOf(date, period, anchor) {
  if (period === "monthly") {
    const [y, m] = date.split("-").map(Number);
    return { start: serial(y + "-" + String(m).padStart(2, "0") + "-01"), end: Date.UTC(y, m, 0) / 86400000 + 25569 };
  }
  const len = period === "weekly" ? 7 : 14, start = anchor + Math.floor((serial(date) - anchor) / len) * len;
  return { start, end: start + len - 1 };
}
function makeBundles() {
  ensureAnchor();
  const f = $("bfilter").value, anchor = serial(settings.anchor), map = {};
  shifts.filter(s => !f || s.provider === f).forEach(s => {
    const r = periodOf(s.date, settings.period, anchor), k = r.start + "|" + s.provider;
    (map[k] = map[k] || { start: r.start, end: r.end, provider: s.provider, list: [] }).list.push(s);
  });
  return Object.values(map).sort((a, b) => b.start - a.start || a.provider.localeCompare(b.provider)).map(b => {
    let hrs = 0, amt = 0, paid = 0;
    b.list.forEach(s => { const c = calcS(s); hrs += c.hrs; amt += c.amt; if (s.status === "Paid") paid += c.amt; });
    const days = new Set(b.list.map(s => s.date)).size;
    const elapsed = Math.max(0, Math.min(b.end, serial(today())) - b.start + 1);
    const st = [...new Set(b.list.map(s => s.status || ""))];
    return Object.assign(b, { hrs: round2(hrs), amt: round2(amt), unpaid: round2(amt - paid), days, off: Math.max(0, elapsed - days), status: st.length === 1 ? st[0] : "Mixed" });
  });
}
function periodLabel(b) {
  if (settings.period === "monthly") return dnum(b.start).toLocaleString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  return dlabel(b.start, dnum(b.start).getUTCFullYear() !== dnum(b.end).getUTCFullYear()) + " to " + dlabel(b.end, true);
}
function renderBundles() {
  ensureAnchor();
  $("anchor").value = settings.anchor;
  $("anchorBox").classList.toggle("hide", settings.period === "monthly");
  document.querySelectorAll("#bper button").forEach(b => b.classList.toggle("on", b.dataset.v === settings.period));
  const list = makeBundles();
  $("blist").innerHTML = list.length ? list.map(b => {
    const opts = ["", "Pending", "Invoiced", "Paid"].map(o => `<option value="${o}"${o === b.status ? " selected" : ""}>${o || "Status: not set"}</option>`).join("")
      + (b.status === "Mixed" ? '<option value="__m" selected disabled>Status: mixed</option>' : "");
    const lines = b.list.slice().sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start)).map(s => {
      const c = calcS(s);
      return `<div>${ddmmyyyy(s.date)}, ${clock(s.start)} to ${clock(s.end)}, ${c.hrs} hrs${s.type === "fixed" ? " (fixed)" : ""}, ${money(c.amt)}, ${esc(s.status || "no status")}</div>`;
    }).join("");
    return `<div class="item bundle">
      <div class="top"><b>${periodLabel(b)}</b><b>${money(b.amt)}</b></div>
      <div class="sub">${esc(b.provider)}: ${b.list.length} shift${b.list.length > 1 ? "s" : ""}, ${b.hrs} hrs, ${b.days} day${b.days > 1 ? "s" : ""} worked${b.off ? ", " + b.off + " off" : ""}${b.unpaid > 0 && b.unpaid !== b.amt ? ", " + money(b.unpaid) + " not paid" : ""}</div>
      <select aria-label="Bundle status" class="s-${b.status}" data-ids="${b.list.map(s => s.id).join(",")}">${opts}</select>
      <details><summary>View shifts</summary>${lines}</details></div>`;
  }).join("") : '<div class="empty">No shifts to bundle yet.</div>';
}
$("bper").addEventListener("click", ev => { if (ev.target.dataset.v) { settings.period = ev.target.dataset.v; saveSettings(); renderBundles(); } });
$("anchor").addEventListener("change", () => { if ($("anchor").value) { settings.anchor = $("anchor").value; saveSettings(); } renderBundles(); });
$("bfilter").addEventListener("change", renderBundles);
$("blist").addEventListener("change", ev => {
  if (!ev.target.dataset.ids) return;
  const ids = ev.target.dataset.ids.split(",");
  shifts.forEach(s => { if (ids.includes(s.id)) s.status = ev.target.value; });
  persist(); renderBundles();
});
$("xBund").addEventListener("click", () => {
  const list = makeBundles();
  if (!list.length) return alert("Nothing to export yet.");
  const rows = [["Period start", "Period end", "Provider", "Shifts", "Days worked", "Days off", "Total hours", "Total amount ($)", "Status"]]
    .concat(list.map(b => [b.start, b.end, b.provider, b.list.length, b.days, b.off, b.hrs, b.amt, b.status || "Not set"]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 2; r <= rows.length; r++) { ws["A" + r].z = ws["B" + r].z = "dd/mm/yyyy"; ws["H" + r].z = "$#,##0.00"; }
  ws["!cols"] = [13, 13, 22, 8, 12, 9, 12, 16, 12].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bundles");
  exportFile(wb, "work_log_" + settings.period + "_bundles.xlsx");
});

/* ---------- Tabs & start-up ---------- */
document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach(x => x.classList.toggle("on", x === b));
  ["log", "hist", "bund"].forEach(id => $(id).classList.toggle("hide", b.dataset.tab !== id));
  if (b.dataset.tab === "hist") renderHistory();
  if (b.dataset.tab === "bund") renderBundles();
}));
load(); loadSettings(); $("date").value = today(); refreshProviders(); preview();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
