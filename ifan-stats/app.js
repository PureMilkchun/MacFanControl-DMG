const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const activitySpan = document.getElementById("activitySpan");
const sessionMeta = document.getElementById("sessionMeta");
const dailyTable = document.getElementById("dailyTable");
const currentUsers = document.getElementById("currentUsers");
const downloadsTotal = document.getElementById("downloadsTotal");
const activeTotal = document.getElementById("activeTotal");
const generatedAt = document.getElementById("generatedAt");
const chart = document.getElementById("trendChart");
const ctx = chart.getContext("2d");
const activityChart = document.getElementById("activityChart");
const activityCtx = activityChart.getContext("2d");
let activityChartState = null;
let trendChartState = null;

function setAuthed(authed) {
  loginView.classList.toggle("hidden", authed);
  dashboardView.classList.toggle("hidden", !authed);
  logoutBtn.classList.toggle("hidden", !authed);
  sessionMeta.classList.toggle("hidden", !authed);
}

function showLoginError(message) {
  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

function clearLoginError() {
  loginError.textContent = "";
  loginError.classList.add("hidden");
}

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function fmtAxisDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ["-", ""];
  const dateLabel = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  const timeLabel = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return [dateLabel, timeLabel];
}

function fmtTooltipDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function setupCanvas(canvas, targetCtx) {
  if (!canvas.dataset.baseWidth) {
    canvas.dataset.baseWidth = String(Number(canvas.getAttribute("width")) || 980);
  }
  if (!canvas.dataset.baseHeight) {
    canvas.dataset.baseHeight = String(Number(canvas.getAttribute("height")) || 260);
  }

  const rect = canvas.getBoundingClientRect();
  const parentRect = canvas.parentElement?.getBoundingClientRect();
  const displayWidth =
    Math.round(rect.width) ||
    Math.round(parentRect?.width || 0) ||
    Number(canvas.dataset.baseWidth) ||
    980;
  const displayHeight = Number(canvas.dataset.baseHeight) || 260;
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(displayWidth * dpr);
  const pixelHeight = Math.round(displayHeight * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.height = `${displayHeight}px`;
  }

  canvas.style.width = "100%";
  canvas.style.maxWidth = "100%";
  targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { width: displayWidth, height: displayHeight };
}

function renderTable(rows) {
  dailyTable.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.downloads}</td>
      <td>${row.active_unique}</td>
      <td>${row.active_events}</td>
    `;
    dailyTable.appendChild(tr);
  }
}

function parseVersionBuild(v) {
  // format: "2.9.5 (38)" or "2.9.1-32" or "2.8.28"
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:\s*\((\d+)\))?/);
  if (!m) return [0, 0, 0, 0];
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4] || "0")];
}

function compareVersionDesc(a, b) {
  const va = parseVersionBuild(a.version);
  const vb = parseVersionBuild(b.version);
  for (let i = 0; i < 4; i++) {
    if (va[i] !== vb[i]) return vb[i] - va[i];
  }
  return 0;
}

function renderVersionTable(rows) {
  const versionTable = document.getElementById("versionTable");
  if (!versionTable) return;
  versionTable.innerHTML = "";
  if (!rows || rows.length === 0) {
    versionTable.innerHTML = '<tr><td colspan="2" style="opacity:.5">暂无数据</td></tr>';
    return;
  }
  const sorted = [...rows].sort(compareVersionDesc);
  for (const row of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.version}</td>
      <td>${row.count}</td>
    `;
    versionTable.appendChild(tr);
  }
  renderVersionPieChart(sorted);
}

const PIE_PALETTE = [
  "#1c1c1c", "#3e3329", "#5d4b38", "#7b6a55",
  "#9c8973", "#bcaa95", "#d5c7b5", "#e9e0d4",
];

let pieState = null; // { rows, total, canvas, legendEl, size, dpr }

function renderVersionPieChart(rows) {
  const canvas = document.getElementById("versionPieChart");
  const legendEl = document.getElementById("pieLegend");
  if (!canvas || !legendEl) return;

  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) {
    legendEl.innerHTML = "";
    pieState = null;
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const size = 240;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";

  pieState = { rows, total, canvas, legendEl, size, dpr };
  drawPie(null);

  // legend
  legendEl.innerHTML = rows.map((r, i) => {
    const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
    return `<span class="pie-legend-item" data-pie-index="${i}">
      <span class="pie-legend-dot" style="background:${PIE_PALETTE[i % PIE_PALETTE.length]}"></span>
      ${r.version} · ${pct}%
    </span>`;
  }).join("");

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - size / 2;
    const my = e.clientY - rect.top - size / 2;
    const dist = Math.sqrt(mx * mx + my * my);
    const outerR = size / 2 - 4;
    const innerR = outerR * 0.44;
    if (dist < innerR || dist > outerR) {
      drawPie(null);
      highlightLegend(-1);
      return;
    }
    let angle = Math.atan2(my, mx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    let cum = 0;
    let hoverIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const slice = (rows[i].count / total) * Math.PI * 2;
      cum += slice;
      if (angle <= cum + 0.001) { hoverIdx = i; break; }
    }
    drawPie(hoverIdx);
    highlightLegend(hoverIdx);
  };

  canvas.onmouseleave = () => {
    drawPie(null);
    highlightLegend(-1);
  };
}

function drawPie(hoverIdx) {
  if (!pieState) return;
  const { rows, total, canvas, size, dpr } = pieState;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.44;
  const pullOut = 6;
  const gap = 0.025;

  let angle = -Math.PI / 2;
  for (let i = 0; i < rows.length; i++) {
    const frac = rows[i].count / total;
    const slice = frac * Math.PI * 2;
    if (slice < 0.02) { angle += slice; continue; }

    const mid = angle + slice / 2;
    const isHovered = (i === hoverIdx);
    const sx = isHovered ? Math.cos(mid) * pullOut : 0;
    const sy = isHovered ? Math.sin(mid) * pullOut : 0;

    ctx.beginPath();
    ctx.arc(cx + sx, cy + sy, outerR, angle + gap, angle + slice - gap);
    ctx.arc(cx + sx, cy + sy, innerR, angle + slice - gap, angle + gap, true);
    ctx.closePath();
    ctx.fillStyle = PIE_PALETTE[i % PIE_PALETTE.length];
    if (!isHovered && hoverIdx != null) ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (frac > 0.06) {
      const lr = innerR + (outerR - innerR) * 0.55;
      const lx = cx + sx + Math.cos(mid) * lr;
      const ly = cy + sy + Math.sin(mid) * lr;
      ctx.fillStyle = (i === 0 && !isHovered) ? "rgba(255,255,255,0.85)" : "#111111";
      if (isHovered) {
        ctx.font = `600 13px "Avenir Next", sans-serif`;
      } else {
        ctx.font = `${frac > 0.25 ? "600 " : ""}${frac > 0.25 ? 12 : 10}px "Avenir Next", sans-serif`;
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.round(frac * 100) + "%", lx, ly);
    }

    angle += slice;
  }

  // center
  ctx.fillStyle = "#111111";
  ctx.font = "600 22px 'Baskerville', 'Iowan Old Style', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(total), cx, cy - 2);

  ctx.restore();
}

function highlightLegend(idx) {
  const items = document.querySelectorAll(".pie-legend-item");
  items.forEach((el, i) => {
    if (idx >= 0 && i === idx) {
      el.style.opacity = "1";
      el.style.fontWeight = "600";
    } else if (idx >= 0) {
      el.style.opacity = "0.35";
      el.style.fontWeight = "400";
    } else {
      el.style.opacity = "";
      el.style.fontWeight = "";
    }
  });
}

function getFeedbackDoneSet() {
  try {
    const raw = localStorage.getItem("ifan_feedback_done");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFeedbackDoneSet(set) {
  localStorage.setItem("ifan_feedback_done", JSON.stringify([...set]));
}

function feedbackRowKey(row) {
  return `${row.created_at}_${row.install_hash || ""}`;
}

function renderFeedbackTable(rows) {
  const feedbackTable = document.getElementById("feedbackTable");
  if (!feedbackTable) return;
  feedbackTable.innerHTML = "";
  if (!rows || rows.length === 0) {
    feedbackTable.innerHTML = '<tr><td colspan="5" style="opacity:.5">暂无反馈</td></tr>';
    return;
  }

  const doneSet = getFeedbackDoneSet();

  const sorted = [...rows].sort((a, b) => {
    const aDone = doneSet.has(feedbackRowKey(a)) ? 1 : 0;
    const bDone = doneSet.has(feedbackRowKey(b)) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return (b.created_at || 0) - (a.created_at || 0);
  });

  for (const row of sorted) {
    const key = feedbackRowKey(row);
    const done = doneSet.has(key);
    const tr = document.createElement("tr");
    if (done) tr.classList.add("feedback-done");

    const date = new Date(row.created_at * 1000);
    const dateStr = date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const content = row.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const email = row.email ? `<a href="mailto:${row.email}">${row.email}</a>` : "-";

    tr.innerHTML = `
      <td style="text-align:center"><input type="checkbox" class="feedback-check" data-key="${key}" ${done ? "checked" : ""}></td>
      <td>${dateStr}</td>
      <td>${content}</td>
      <td>${email}</td>
      <td>${row.version}</td>
    `;
    feedbackTable.appendChild(tr);
  }

  feedbackTable.querySelectorAll(".feedback-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const set = getFeedbackDoneSet();
      if (cb.checked) {
        set.add(cb.dataset.key);
      } else {
        set.delete(cb.dataset.key);
      }
      saveFeedbackDoneSet(set);
      renderFeedbackTable(rows);
    });
  });
}

function drawLine(targetCtx, points, color, maxY, width, height, leftPad, rightPad, topPad, bottomPad) {
  if (points.length === 0) return;
  const chartWidth = width - leftPad - rightPad;
  const chartHeight = height - topPad - bottomPad;
  targetCtx.beginPath();
  targetCtx.lineWidth = 2;
  targetCtx.strokeStyle = color;
  points.forEach((value, i) => {
    const x = leftPad + (i * chartWidth) / Math.max(points.length - 1, 1);
    const y = topPad + chartHeight - (value / Math.max(maxY, 1)) * chartHeight;
    if (i === 0) targetCtx.moveTo(x, y);
    else targetCtx.lineTo(x, y);
  });
  targetCtx.stroke();
}

function drawXAxisLabels(targetCtx, series, width, height, leftPad, rightPad, bottomPad) {
  if (!series.length) return;
  const chartWidth = width - leftPad - rightPad;
  const tickCount = Math.min(6, series.length);
  const seen = new Set();

  targetCtx.strokeStyle = "#d7dde7";
  targetCtx.fillStyle = "#64748b";
  targetCtx.font = "11px sans-serif";
  targetCtx.textAlign = "center";

  for (let tick = 0; tick < tickCount; tick += 1) {
    const index = Math.round((tick * (series.length - 1)) / Math.max(tickCount - 1, 1));
    if (seen.has(index)) continue;
    seen.add(index);

    const x = leftPad + (index * chartWidth) / Math.max(series.length - 1, 1);
    const [dateLabel, timeLabel] = fmtAxisDate(series[index].bucket_start_iso);

    targetCtx.beginPath();
    targetCtx.moveTo(x, height - bottomPad);
    targetCtx.lineTo(x, height - bottomPad + 6);
    targetCtx.stroke();

    targetCtx.fillText(dateLabel, x, height - bottomPad + 18);
    targetCtx.fillText(timeLabel, x, height - bottomPad + 31);
  }

  targetCtx.textAlign = "start";
}

function drawHover(targetCtx, point, width, height, topPad, bottomPad, color = "#f97316") {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  targetCtx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.28)`;
  targetCtx.lineWidth = 1;
  targetCtx.beginPath();
  targetCtx.moveTo(point.x, topPad);
  targetCtx.lineTo(point.x, height - bottomPad);
  targetCtx.stroke();

  targetCtx.fillStyle = color;
  targetCtx.beginPath();
  targetCtx.arc(point.x, point.y, 4, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.fillStyle = "#ffffff";
  targetCtx.beginPath();
  targetCtx.arc(point.x, point.y, 2, 0, Math.PI * 2);
  targetCtx.fill();
}

function getActivityChartModel(series, width, height) {
  const leftPad = 42;
  const rightPad = 10;
  const topPad = 14;
  const bottomPad = 44;
  const values = series.map((v) => v.active_users ?? 0);
  const maxY = Math.max(1, ...values);
  const chartWidth = width - leftPad - rightPad;
  const chartHeight = height - topPad - bottomPad;
  const points = values.map((value, index) => ({
    ...series[index],
    value,
    x: leftPad + (index * chartWidth) / Math.max(values.length - 1, 1),
    y: topPad + chartHeight - (value / Math.max(maxY, 1)) * chartHeight,
  }));

  return { leftPad, rightPad, topPad, bottomPad, maxY, values, points };
}

function drawCanvasTooltip(targetCtx, point, width, height, versionList, dailyVersions) {
  const dateLine = fmtTooltipDate(point.bucket_start_iso);
  const valueLine = `活跃用户：${point.active_users}`;
  const paddingX = 10;
  const paddingY = 8;
  const lineHeight = 16;
  const verGap = 16;

  const versions = [];
  if (versionList && dailyVersions) {
    for (const ver of versionList) {
      const cnt = dailyVersions[ver] || 0;
      if (cnt > 0) versions.push({ ver, cnt });
    }
  }

  targetCtx.font = "12px sans-serif";
  let verBlockWidth = 0;
  if (versions.length > 0) {
    for (const { ver, cnt } of versions) {
      verBlockWidth = Math.max(verBlockWidth, targetCtx.measureText(ver).width + verGap + targetCtx.measureText(String(cnt)).width);
    }
  }
  const headerWidth = Math.max(targetCtx.measureText(dateLine).width, targetCtx.measureText(valueLine).width);
  const tooltipWidth = Math.max(headerWidth, verBlockWidth) + paddingX * 2;
  const tooltipHeight = paddingY * 2 + lineHeight * 2 + (versions.length > 0 ? 8 + lineHeight * versions.length : 0);

  const margin = 12;
  let x = point.x + 14;
  let y = point.y - tooltipHeight - 14;

  if (x + tooltipWidth > width - margin) x = point.x - tooltipWidth - 14;
  if (x < margin) x = margin;
  if (y < margin) y = point.y + 14;
  if (y + tooltipHeight > height - margin) y = height - tooltipHeight - margin;

  targetCtx.fillStyle = "rgba(17, 17, 17, 0.94)";
  targetCtx.beginPath();
  targetCtx.roundRect(x, y, tooltipWidth, tooltipHeight, 10);
  targetCtx.fill();

  targetCtx.fillStyle = "#f3f1ec";
  targetCtx.textAlign = "start";
  let ty = y + paddingY + 11;
  targetCtx.fillText(dateLine, x + paddingX, ty);
  ty += lineHeight;
  targetCtx.fillText(valueLine, x + paddingX, ty);

  if (versions.length > 0) {
    ty += lineHeight;
    targetCtx.strokeStyle = "rgba(255,255,255,0.15)";
    targetCtx.beginPath();
    targetCtx.moveTo(x + paddingX, ty - 6);
    targetCtx.lineTo(x + tooltipWidth - paddingX, ty - 6);
    targetCtx.stroke();
    targetCtx.fillStyle = "#94a3b8";
    for (const { ver, cnt } of versions) {
      targetCtx.textAlign = "start";
      targetCtx.fillText(ver, x + paddingX, ty + 10);
      targetCtx.textAlign = "right";
      targetCtx.fillText(String(cnt), x + tooltipWidth - paddingX, ty + 10);
      ty += lineHeight;
    }
    targetCtx.textAlign = "start";
  }
}

function drawTrendTooltip(targetCtx, row, versionList, pointX, width, height) {
  const paddingX = 10;
  const paddingY = 8;
  const lineHeight = 16;
  const verGap = 16;

  const date = new Date(row.date + "T00:00:00");
  const dateLine = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  const summaryLine = `下载：${row.downloads}    用户：${row.active_unique}`;

  const versions = [];
  if (versionList) {
    for (const ver of versionList) {
      const cnt = row.versions?.[ver] || 0;
      if (cnt > 0) versions.push({ ver, cnt });
    }
  }

  targetCtx.font = "12px sans-serif";
  let verBlockWidth = 0;
  if (versions.length > 0) {
    for (const { ver, cnt } of versions) {
      verBlockWidth = Math.max(verBlockWidth, targetCtx.measureText(ver).width + verGap + targetCtx.measureText(String(cnt)).width);
    }
  }
  const headerWidth = Math.max(targetCtx.measureText(dateLine).width, targetCtx.measureText(summaryLine).width);
  const tooltipWidth = Math.max(headerWidth, verBlockWidth) + paddingX * 2;
  const tooltipHeight = paddingY * 2 + lineHeight * 2 + (versions.length > 0 ? 8 + lineHeight * versions.length : 0);

  const margin = 12;
  let x = pointX + 14;
  let y = height / 2 - tooltipHeight / 2;
  if (x + tooltipWidth > width - margin) x = pointX - tooltipWidth - 14;
  if (x < margin) x = margin;
  if (y < margin) y = margin;
  if (y + tooltipHeight > height - margin) y = height - tooltipHeight - margin;

  targetCtx.fillStyle = "rgba(17, 17, 17, 0.94)";
  targetCtx.beginPath();
  targetCtx.roundRect(x, y, tooltipWidth, tooltipHeight, 10);
  targetCtx.fill();

  targetCtx.fillStyle = "#f3f1ec";
  targetCtx.textAlign = "start";
  let ty = y + paddingY + 11;
  targetCtx.fillText(dateLine, x + paddingX, ty);
  ty += lineHeight;
  targetCtx.fillText(summaryLine, x + paddingX, ty);

  if (versions.length > 0) {
    ty += lineHeight;
    targetCtx.strokeStyle = "rgba(255,255,255,0.15)";
    targetCtx.beginPath();
    targetCtx.moveTo(x + paddingX, ty - 6);
    targetCtx.lineTo(x + tooltipWidth - paddingX, ty - 6);
    targetCtx.stroke();
    targetCtx.fillStyle = "#94a3b8";
    for (const { ver, cnt } of versions) {
      targetCtx.textAlign = "start";
      targetCtx.fillText(ver, x + paddingX, ty + 10);
      targetCtx.textAlign = "right";
      targetCtx.fillText(String(cnt), x + tooltipWidth - paddingX, ty + 10);
      ty += lineHeight;
    }
    targetCtx.textAlign = "start";
  }
}

function renderChart(rows, versionList, hoverIndex = null) {
  const { width, height } = setupCanvas(chart, ctx);
  const leftPad = 42;
  const rightPad = 10;
  const topPad = 14;
  const bottomPad = 28;
  const downloads = rows.map((v) => v.downloads);
  const active = rows.map((v) => v.active_unique);
  const maxY = Math.max(1, ...downloads, ...active);
  const chartWidth = width - leftPad - rightPad;
  const chartHeight = height - topPad - bottomPad;

  const points = rows.map((row, i) => ({
    x: leftPad + (i * chartWidth) / Math.max(rows.length - 1, 1),
    y: topPad + chartHeight - ((row.active_unique || 0) / Math.max(maxY, 1)) * chartHeight,
  }));

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i += 1) {
    const y = topPad + (chartHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(leftPad, y);
    ctx.lineTo(width - rightPad, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#64748b";
  ctx.font = "12px sans-serif";
  ctx.fillText("0", 10, height - bottomPad + 4);
  ctx.fillText(String(maxY), 10, topPad + 4);

  drawLine(ctx, downloads, "#2563eb", maxY, width, height, leftPad, rightPad, topPad, bottomPad);
  drawLine(ctx, active, "#f97316", maxY, width, height, leftPad, rightPad, topPad, bottomPad);

  trendChartState = { rows, versionList, points, leftPad, rightPad, width, height, topPad, bottomPad };

  if (hoverIndex != null && points[hoverIndex]) {
    const pt = points[hoverIndex];
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pt.x, topPad);
    ctx.lineTo(pt.x, height - bottomPad);
    ctx.stroke();
    drawTrendTooltip(ctx, rows[hoverIndex], versionList, pt.x, width, height);
  }
}

function renderActivityChart(series, hoverIndex = null, versionList = []) {
  const { width, height } = setupCanvas(activityChart, activityCtx);
  const { leftPad, rightPad, topPad, bottomPad, maxY, values, points } = getActivityChartModel(series, width, height);

  activityCtx.clearRect(0, 0, width, height);
  activityCtx.fillStyle = "#ffffff";
  activityCtx.fillRect(0, 0, width, height);
  activityCtx.strokeStyle = "#e2e8f0";
  activityCtx.lineWidth = 1;

  for (let i = 0; i <= 4; i += 1) {
    const y = topPad + ((height - topPad - bottomPad) * i) / 4;
    activityCtx.beginPath();
    activityCtx.moveTo(leftPad, y);
    activityCtx.lineTo(width - rightPad, y);
    activityCtx.stroke();
  }

  activityCtx.fillStyle = "#64748b";
  activityCtx.font = "12px sans-serif";
  activityCtx.fillText("0", 10, height - bottomPad + 4);
  activityCtx.fillText(String(maxY), 10, topPad + 4);

  drawLine(activityCtx, values, "#f97316", maxY, width, height, leftPad, rightPad, topPad, bottomPad);
  drawXAxisLabels(activityCtx, series, width, height, leftPad, rightPad, bottomPad);

  activityChartState = { series, points, leftPad, rightPad, topPad, bottomPad, width, height, versionList };

  if (hoverIndex != null && points[hoverIndex]) {
    drawHover(activityCtx, points[hoverIndex], width, height, topPad, bottomPad);
    drawCanvasTooltip(activityCtx, points[hoverIndex], width, height, versionList, points[hoverIndex].versions);
  }
}

async function loadSummary() {
  const spanHours = Number(activitySpan?.value || 12);
  const response = await fetch(`/api/dashboard/summary?days=30&activity_span_hours=${spanHours}`, {
    credentials: "include",
  });
  if (response.status === 401) {
    setAuthed(false);
    return;
  }
  if (!response.ok) {
    throw new Error("统计服务不可用");
  }
  const data = await response.json();
  currentUsers.textContent = String(data.current_users_15m ?? 0);
  downloadsTotal.textContent = String(data.downloads_total ?? 0);
  activeTotal.textContent = String(data.active_all_time_unique ?? 0);
  generatedAt.textContent = fmtDate(data.generated_at);
  renderTable(data.daily || []);
  renderChart(data.daily || [], data.version_list || []);
  renderActivityChart(data.activity_15m || [], null, data.version_list || []);
  renderVersionTable(data.version_breakdown || []);
  renderFeedbackTable(data.feedback || []);
}

activityChart.addEventListener("mousemove", (event) => {
  if (!activityChartState || !activityChartState.points.length) return;
  const rect = activityChart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const { points, leftPad, rightPad, width } = activityChartState;
  const clampedX = Math.min(Math.max(x, leftPad), width - rightPad);
  let hoverIndex = 0;
  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length; i += 1) {
    const distance = Math.abs(points[i].x - clampedX);
    if (distance < minDistance) {
      minDistance = distance;
      hoverIndex = i;
    }
  }

  renderActivityChart(activityChartState.series, hoverIndex, activityChartState.versionList);
});

activityChart.addEventListener("mouseleave", () => {
  if (!activityChartState) return;
  renderActivityChart(activityChartState.series, null, activityChartState.versionList);
});

chart.addEventListener("mousemove", (event) => {
  if (!trendChartState || !trendChartState.points.length) return;
  const rect = chart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const { points, leftPad, rightPad, width } = trendChartState;
  const clampedX = Math.min(Math.max(x, leftPad), width - rightPad);
  let hoverIndex = 0;
  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length; i += 1) {
    const distance = Math.abs(points[i].x - clampedX);
    if (distance < minDistance) {
      minDistance = distance;
      hoverIndex = i;
    }
  }

  renderChart(trendChartState.rows, trendChartState.versionList, hoverIndex);
});

chart.addEventListener("mouseleave", () => {
  if (!trendChartState) return;
  renderChart(trendChartState.rows, trendChartState.versionList);
});

async function checkSession() {
  const response = await fetch("/api/auth/session", { credentials: "include" });
  if (!response.ok) {
    setAuthed(false);
    return;
  }
  const data = await response.json();
  setAuthed(true);
  sessionMeta.textContent = `已登录：${data.username} · 会话到期：${fmtDate(data.expires_at)}`;
  await loadSummary();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearLoginError();
  const fd = new FormData(loginForm);
  const payload = Object.fromEntries(fd.entries());
  payload.totp = String(payload.totp || "").trim();
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 429) {
      showLoginError("尝试次数过多，请稍后再试。");
      return;
    }
    if (!response.ok) {
      showLoginError("登录失败，请检查账号、密码或动态码。");
      return;
    }
    loginForm.reset();
    await checkSession();
  } catch {
    showLoginError("网络异常，请稍后重试。");
  }
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  setAuthed(false);
});

refreshBtn.addEventListener("click", async () => {
  try {
    await loadSummary();
  } catch {
    alert("刷新失败，请稍后重试。");
  }
});

activitySpan?.addEventListener("change", async () => {
  try {
    await loadSummary();
  } catch {
    alert("切换时间跨度失败，请稍后重试。");
  }
});

checkSession().catch(() => {
  setAuthed(false);
});
