const MONTHS = ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const state = {
  kennzahl: "Neuzulassungen",
  fahrzeugart: "Wohnmobile",
  period: null,
  payload: null,
};

const euroNumber = new Intl.NumberFormat("de-DE");
const percentNumber = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function qs(id) {
  return document.getElementById(id);
}

function recordsFor(kennzahl, fahrzeugart) {
  return state.payload.records
    .filter((item) => item.kennzahl === kennzahl && item.fahrzeugart === fahrzeugart)
    .sort((a, b) => a.jahr - b.jahr || a.monat - b.monat);
}

function valueFor(records, year, month) {
  return records.find((item) => item.jahr === year && item.monat === month)?.wert ?? null;
}

function sumFor(records, year, maxMonth = 12) {
  return records
    .filter((item) => item.jahr === year && item.monat <= maxMonth)
    .reduce((sum, item) => sum + item.wert, 0);
}

function pct(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function deltaText(value, suffix = "ggü. Vorjahr") {
  if (value === null || Number.isNaN(value)) return "kein Vergleich";
  const sign = value > 0 ? "+" : "";
  return `${sign}${percentNumber.format(value)} % ${suffix}`;
}

function setDelta(element, value, suffix) {
  element.textContent = deltaText(value, suffix);
  element.classList.remove("positive", "negative");
  if (value > 0) element.classList.add("positive");
  if (value < 0) element.classList.add("negative");
}

function latestCompletePoint(records) {
  return records.reduce((latest, item) => {
    if (!latest) return item;
    if (item.jahr > latest.jahr) return item;
    if (item.jahr === latest.jahr && item.monat > latest.monat) return item;
    return latest;
  }, null);
}

function availablePeriods() {
  const counts = new Map();
  const periodIndexes = new Map();
  state.payload.records.forEach((item) => {
    const key = `${item.jahr}-${String(item.monat).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    periodIndexes.set(key, item.jahr * 12 + item.monat);
  });

  return [...counts.entries()]
    .filter(([key, count]) => {
      const endIndex = periodIndexes.get(key);
      const rollingRecordCount = state.payload.records.filter((item) => {
        const index = item.jahr * 12 + item.monat;
        return index <= endIndex && index > endIndex - 12;
      }).length;
      return count >= 4 && rollingRecordCount >= 48;
    })
    .map(([key]) => {
      const [year, month] = key.split("-").map(Number);
      return { year, month, key };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

function periodLabel(period) {
  return `${MONTH_NAMES[period.month - 1]} ${period.year}`;
}

function populatePeriodSelect() {
  const select = qs("periodSelect");
  const periods = availablePeriods();
  select.innerHTML = periods
    .map((period) => `<option value="${period.key}">${periodLabel(period)}</option>`)
    .join("");
  state.period = periods[0] ?? null;
  if (state.period) select.value = state.period.key;
}

function selectedPeriodFor(records) {
  if (!state.period) return latestCompletePoint(records);
  const hasValue = valueFor(records, state.period.year, state.period.month) !== null;
  if (hasValue) return state.period;
  return latestCompletePoint(records);
}

function rollingTwelve(records, endYear, endMonth) {
  const endIndex = endYear * 12 + endMonth;
  return records
    .filter((item) => {
      const index = item.jahr * 12 + item.monat;
      return index <= endIndex && index > endIndex - 12;
    })
    .reduce((sum, item) => sum + item.wert, 0);
}

function rollingPeriodLabel(endYear, endMonth, short = false) {
  const endIndex = endYear * 12 + (endMonth - 1);
  const startIndex = endIndex - 11;
  const startYear = Math.floor(startIndex / 12);
  const startMonth = startIndex % 12;
  const startYearLabel = short ? String(startYear).slice(2) : startYear;
  const endYearLabel = short ? String(endYear).slice(2) : endYear;
  return `${MONTHS[startMonth]} ${startYearLabel}–${MONTHS[endMonth - 1]} ${endYearLabel}`;
}

function trendValuesFor(kennzahl, fahrzeugart) {
  return (state.payload.trendValues ?? [])
    .filter((item) => item.kennzahl === kennzahl && item.fahrzeugart === fahrzeugart)
    .sort((a, b) => a.jahr - b.jahr);
}

function linePath(points) {
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
}

function isCompactViewport() {
  return window.matchMedia("(max-width: 560px)").matches;
}

function renderMonthlyChart(records, year, monthLimit) {
  const compact = isCompactViewport();
  const previousYear = year - 1;
  const width = compact ? 360 : 760;
  const height = compact ? 220 : 250;
  const pad = compact
    ? { top: 30, right: 12, bottom: 32, left: 26 }
    : { top: 26, right: 22, bottom: 38, left: 44 };
  const months = Array.from({ length: monthLimit }, (_, index) => index + 1);
  const current = months.map((month) => valueFor(records, year, month));
  const previous = months.map((month) => valueFor(records, previousYear, month));
  const maxValue = Math.max(...current, ...previous, 1);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (months.length === 1 ? plotW / 2 : (plotW * index) / (months.length - 1));
  const y = (value) => pad.top + plotH - (value / maxValue) * plotH;

  const currentPoints = current.map((value, index) => ({ x: x(index), y: y(value), value, month: months[index] }));
  const previousPoints = previous.map((value, index) => ({ x: x(index), y: y(value), value, month: months[index] }));
  const grid = [0.25, 0.5, 0.75, 1].map((step) => pad.top + plotH - plotH * step);

  qs("monthlyChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      ${grid.map((lineY) => `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${lineY}" y2="${lineY}"></line>`).join("")}
      <path d="${linePath(previousPoints)}" fill="none" stroke="#aab3c2" stroke-width="${compact ? 2 : 3}"></path>
      <path d="${linePath(currentPoints)}" fill="none" stroke="#1f5f9f" stroke-width="${compact ? 3 : 4}"></path>
      ${previousPoints.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="${compact ? 3 : 4}" fill="#aab3c2"></circle>`).join("")}
      ${currentPoints.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="${compact ? 4 : 5}" fill="#1f5f9f"></circle>`).join("")}
      ${currentPoints.map((point) => {
        return `<text class="point-label emphasis" x="${point.x}" y="${Math.max(14, point.y - 10)}" text-anchor="middle">${euroNumber.format(point.value)}</text>`;
      }).join("")}
      <g class="axis">
        ${months.map((month, index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="middle">${MONTHS[month - 1]}</text>`).join("")}
      </g>
    </svg>
  `;
}

function renderTrendChart(records, year, monthLimit) {
  const compact = isCompactViewport();
  const storedTrend = trendValuesFor(state.kennzahl, state.fahrzeugart);
  const monthlyYears = [...new Set(records.map((item) => item.jahr))]
    .filter((itemYear) => itemYear < year)
    .sort((a, b) => a - b);
  const fallbackTrend = monthlyYears.map((itemYear) => ({
    jahr: itemYear,
    wert: sumFor(records, itemYear, 12),
  }));
  const trendSource = storedTrend.length ? storedTrend : fallbackTrend;
  const width = compact ? 360 : 760;
  const height = compact ? 220 : 210;
  const pad = compact
    ? { top: 32, right: 10, bottom: 36, left: 12 }
    : { top: 26, right: 20, bottom: 34, left: 36 };
  const values = trendSource
    .filter((item) => item.jahr < year)
    .map((item) => ({
    year: item.jahr,
    value: item.wert,
    partial: false,
  }));

  values.push({
    year,
    value: rollingTwelve(records, year, monthLimit),
    partial: true,
  });

  const maxValue = Math.max(...values.map((item) => item.value), 1);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const gap = compact ? 7 : 26;
  const barW = Math.max(compact ? 28 : 32, (plotW - gap * (values.length - 1)) / values.length);
  const rollingBarX = pad.left + (values.length - 1) * (barW + gap);
  const separatorX = rollingBarX - gap / 2;
  const rollingLabel = rollingPeriodLabel(year, monthLimit, compact);

  qs("trendChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${pad.top + plotH}" y2="${pad.top + plotH}"></line>
      <line class="rolling-separator" x1="${separatorX}" x2="${separatorX}" y1="10" y2="${height - 8}"></line>
      <text class="rolling-heading" x="${rollingBarX + barW / 2}" y="12" text-anchor="middle">ROLLIEREND</text>
      ${values.map((item, index) => {
        const x = pad.left + index * (barW + gap);
        const barH = (item.value / maxValue) * plotH;
        const y = pad.top + plotH - barH;
        const color = item.partial ? "#c99026" : "#1f5f9f";
        const label = item.partial ? rollingLabel : item.year;
        const displayLabel = compact && !item.partial ? String(item.year).slice(2) : label;
        return `
          <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="${compact ? 4 : 5}" fill="${color}"></rect>
          <text class="bar-label emphasis" x="${x + barW / 2}" y="${Math.max(14, y - 8)}" text-anchor="middle">${euroNumber.format(item.value)}</text>
          <text class="bar-label" x="${x + barW / 2}" y="${height - 20}" text-anchor="middle">${displayLabel}</text>
        `;
      }).join("")}
    </svg>
  `;
}

function update() {
  const records = recordsFor(state.kennzahl, state.fahrzeugart);
  const selected = selectedPeriodFor(records);
  const year = selected.year ?? selected.jahr;
  const month = selected.month ?? selected.monat;
  const previousYear = year - 1;
  const currentValue = valueFor(records, year, month);
  const previousValue = valueFor(records, previousYear, month);
  const ytdValue = sumFor(records, year, month);
  const ytdPrevious = sumFor(records, previousYear, month);
  const rollingValue = rollingTwelve(records, year, month);
  const rollingPrevious = rollingTwelve(records, previousYear, month);

  qs("headline").textContent = `${state.kennzahl} ${state.fahrzeugart}`;
  qs("subline").textContent = `Auswertungsstand: ${MONTH_NAMES[month - 1]} ${year}`;
  qs("sourceLabel").textContent = state.payload.meta.quelle;
  qs("currentValue").textContent = euroNumber.format(currentValue);
  qs("currentLabel").textContent = `${state.kennzahl} im ${MONTH_NAMES[month - 1]} ${year}`;
  setDelta(qs("currentDelta"), pct(currentValue, previousValue), `gegenüber ${MONTH_NAMES[month - 1]} ${previousYear}`);
  qs("ytdValue").textContent = euroNumber.format(ytdValue);
  qs("ytdLabel").textContent = `Jan-${MONTHS[month - 1]} ${year}: ${euroNumber.format(ytdPrevious)} im Vorjahr`;
  setDelta(qs("ytdDelta"), pct(ytdValue, ytdPrevious), `Jan-${MONTHS[month - 1]} vs. Vorjahr`);
  qs("rollingValue").textContent = euroNumber.format(rollingValue);
  setDelta(
    qs("rollingDelta"),
    pct(rollingValue, rollingPrevious),
    `ggü. ${rollingPeriodLabel(previousYear, month)}`
  );
  qs("legendCurrent").textContent = year;
  qs("legendPrevious").textContent = previousYear;
  qs("monthlyCaption").textContent = `${MONTH_NAMES[0]} bis ${MONTH_NAMES[month - 1]} ${year} im Vergleich zu ${previousYear}`;
  qs("trendCaption").textContent = `Jahressummen und ${year} rollierend 12 Monate bis ${MONTH_NAMES[month - 1]}`;
  renderMonthlyChart(records, year, month);
  renderTrendChart(records, year, month);
}

function bindControls() {
  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.field;
      state[field] = button.dataset.value;
      document.querySelectorAll(`.segment[data-field="${field}"]`).forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      update();
    });
  });

  qs("periodSelect").addEventListener("change", (event) => {
    const [year, month] = event.target.value.split("-").map(Number);
    state.period = { year, month, key: event.target.value };
    update();
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(update, 120);
  });
}

async function init() {
  const response = await fetch("data/kennzahlen.json");
  state.payload = await response.json();
  populatePeriodSelect();
  bindControls();
  update();
}

init();
