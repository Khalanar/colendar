const api = {
  async get(path) { const r = await fetch(path); return r.json(); },
  async post(path, body) { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); },
  async patch(path, body) { const r = await fetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); },
  async del(path) { await fetch(path, { method: 'DELETE' }); }
};

let state = {
  year: new Date().getFullYear(),
  events: [],
  drawEventId: null,
  viewingEventId: null,
  highlightEventIds: new Set(),
  itemsCache: new Map(), // date -> items[] for all events
  dayItemsDate: null,
};
const HIGHLIGHT_KEY = 'highlightEventIds';

const calendarEl = document.getElementById('calendar');
const panelEl = document.querySelector('.calendar-panel');
const currentYearEl = document.getElementById('currentYear');
const prevYearBtn = document.getElementById('prevYear');
const nextYearBtn = document.getElementById('nextYear');
const layoutEl = document.querySelector('.layout');
const toggleSidebarBtn = document.getElementById('toggleSidebar');
const eventsListEl = document.getElementById('eventsList');
const itemsListEl = document.getElementById('itemsList');
const itemsCountEl = document.getElementById('itemsCount');
const itemsPanelEl = document.querySelector('.items-panel');
const toggleItemsBtn = document.getElementById('toggleItems');
const eventsPanelEl = document.querySelector('.events-panel');
const toggleEventsBtn = document.getElementById('toggleEvents');
const dayPanelEl = document.getElementById('dayPanel');
const dayPanelTitleEl = document.getElementById('dayPanelTitle');
const dayItemsListEl = document.getElementById('dayItemsList');
const closeDayPanelBtn = document.getElementById('closeDayPanel');
const todayBtn = document.getElementById('todayBtn') || document.getElementById('scrollToday');
const addEventBtn = document.getElementById('addEventBtn');
const selectedThumbsEl = null;
const eventsThumbsEl = document.getElementById('eventsSelectedThumbs');

const eventDialog = document.getElementById('eventDialog');
const eventForm = document.getElementById('eventForm');
const eventDialogTitle = document.getElementById('eventDialogTitle');
const eventTitleInput = document.getElementById('eventTitle');
const eventColorInput = document.getElementById('eventColor');
const cancelEventBtn = document.getElementById('cancelEvent');

const itemDialog = document.getElementById('itemDialog');
const itemForm = document.getElementById('itemForm');
const itemDialogTitle = document.getElementById('itemDialogTitle');
const itemTitleInput = document.getElementById('itemTitle');
const itemTimeInput = document.getElementById('itemTime');
const itemDescriptionInput = document.getElementById('itemDescription');
const itemNotesInput = document.getElementById('itemNotes');

let currentEditItemDate = null; // YYYY-MM-DD for edit/create dialog

const tooltipEl = document.createElement('div');
tooltipEl.className = 'tooltip';
tooltipEl.style.display = 'none';
document.body.appendChild(tooltipEl);

function showTooltip(html, x, y) {
  tooltipEl.innerHTML = html;
  tooltipEl.style.left = Math.min(x + 12, window.innerWidth - 340) + 'px';
  tooltipEl.style.top = Math.min(y + 12, window.innerHeight - 120) + 'px';
  tooltipEl.style.display = 'block';
}
function hideTooltip() { tooltipEl.style.display = 'none'; }

function daysInMonth(year, monthIndex) { return new Date(year, monthIndex + 1, 0).getDate(); }
function weekdayIndex(year, monthIndex, day) { const js = new Date(year, monthIndex, day).getDay(); return (js + 6) % 7; }
function monthName(monthIndex) { return new Date(2000, monthIndex, 1).toLocaleString(undefined, { month: 'long' }); }
function toDateStr(year, monthIndex, day) { return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function formatDate(dateStr) {
  // dateStr is YYYY-MM-DD
  const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
  const day = d;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = months[m - 1];
  const teen = day % 100;
  const last = day % 10;
  let suffix = 'th';
  if (teen < 11 || teen > 13) {
    if (last === 1) suffix = 'st';
    else if (last === 2) suffix = 'nd';
    else if (last === 3) suffix = 'rd';
  }
  return `${day}${suffix} ${month}, ${y}`;
}
// Color utilities for contrast decisions
function hexToRgb(hex) {
  if (!hex) return null;
  let h = hex.trim();
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function relativeLuminance({ r, g, b }) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B; // 0..1
}

// Virtualized multi-year rendering
let yearsWrapper = null;
let renderedYears = new Set();
let minRenderedYear = null;
let maxRenderedYear = null;
let topObserver = null;
let yearObserver = null;
let lastScrollTop = 0;
let isScrollingDown = true;
let suppressYearObserver = false;
panelEl.addEventListener('scroll', () => {
  const st = panelEl.scrollTop;
  isScrollingDown = st > lastScrollTop;
  lastScrollTop = st;
});

function renderCalendar() {
  if (currentYearEl) currentYearEl.textContent = state.year;
  yearsWrapper = document.createElement('div');
  yearsWrapper.className = 'years-wrapper';
  calendarEl.innerHTML = '';
  calendarEl.appendChild(yearsWrapper);

  renderedYears.clear();
  minRenderedYear = maxRenderedYear = null;

  // Render initial years in order: previous, current, next
  ensureYearRendered(state.year - 1);
  ensureYearRendered(state.year);
  ensureYearRendered(state.year + 1);

  installObservers();
  scrollToYear(state.year, false);
  paintCalendarSelections();
}

function renderYearPills(centerYear) {
  if (!yearPillsEl) return;
  yearPillsEl.innerHTML = '';
  const prev = centerYear - 1;
  const curr = centerYear;
  const next = centerYear + 1;
  const make = (y, cls) => { const b = document.createElement('button'); b.className = `year-pill ${cls||''}`.trim(); b.textContent = String(y); b.addEventListener('click', () => scrollToYear(y)); return b; };
  yearPillsEl.appendChild(make(prev, 'muted'));
  yearPillsEl.appendChild(make(curr, 'current'));
  yearPillsEl.appendChild(make(next, 'muted'));
}

function installObservers() {
  if (topObserver) topObserver.disconnect();
  if (yearObserver) yearObserver.disconnect();
  suppressYearObserver = false;

  // Only prepend when scrolling up at top; only append when scrolling down at bottom
  topObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const y = Number(entry.target.dataset.year);
      if (y === minRenderedYear && !isScrollingDown) {
        ensureYearRendered(minRenderedYear - 1, true);
      }
      if (y === maxRenderedYear && isScrollingDown) {
        ensureYearRendered(maxRenderedYear + 1, false);
      }
    }
  }, { root: panelEl, rootMargin: '200px 0px', threshold: 0.01 });

  // Update sticky year label based on section nearest to top
  yearObserver = new IntersectionObserver((entries) => {
    if (suppressYearObserver) return;
    let best = null;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      if (!best || e.boundingClientRect.top < best.boundingClientRect.top) best = e;
    }
    if (best && currentYearEl) currentYearEl.textContent = best.target.dataset.year;
  }, { root: panelEl, threshold: [0, 0.1, 0.2] });

  yearsWrapper.querySelectorAll('.year-section').forEach(sec => {
    topObserver.observe(sec);
    yearObserver.observe(sec);
  });
}

function renderDayItemsPanel() {
  if (!state.dayItemsDate) {
    if (dayPanelEl) dayPanelEl.classList.remove('open');
    // clear previous active highlight
    document.querySelectorAll('.cell.day-active').forEach(el => el.classList.remove('day-active'));
    return;
  }
  if (!dayPanelEl) return;
  dayPanelEl.classList.add('open');
  if (dayPanelTitleEl) dayPanelTitleEl.textContent = `${formatDate(state.dayItemsDate)}`;
  dayItemsListEl.innerHTML = '';
  const items = getCachedItemsForDate(state.dayItemsDate);
  items.sort((a,b) => (a.time||'').localeCompare(b.time||'') || a.event_id - b.event_id || a.id - b.id);
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-day';
    empty.textContent = 'Nothing to see here!';
    dayItemsListEl.appendChild(empty);
  }
  for (const it of items) {
    const ev = state.events.find(e => e.id === it.event_id);
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `
      <div class="row">
        <div class="meta">
          <span style="display:inline-block;width:10px;height:10px;background:${ev?.color ?? '#999'};border-radius:2px;margin-right:6px"></span>
          ${escapeHtml(ev?.title ?? 'Event')} • ${formatDate(state.dayItemsDate)}${it.time ? ' • ' + escapeHtml(it.time) : ''}
        </div>
        <div class="actions">
          <button data-action="edit">Edit</button>
          <button data-action="delete">Delete</button>
        </div>
      </div>
      <div class="title">${escapeHtml(it.title)}</div>
      ${it.description ? `<div>${escapeHtml(it.description)}</div>` : ''}
      ${it.notes ? `<div class=\"meta\">${escapeHtml(it.notes)}</div>` : ''}
    `;
    const editBtn = row.querySelector('[data-action="edit"]');
    const delBtn = row.querySelector('[data-action="delete"]');
    if (editBtn) editBtn.addEventListener('click', () => openItemDialog(it, state.dayItemsDate));
    if (delBtn) delBtn.addEventListener('click', async () => {
      await api.del(`/api/items/${it.id}`);
      await loadItemsForDate(state.dayItemsDate);
      paintCalendarSelections();
      renderItemsPanel();
      renderDayItemsPanel();
    });
    dayItemsListEl.appendChild(row);
  }

  // Add "Add Item" link at the bottom
  const addItemLink = document.createElement('a');
  addItemLink.className = 'add-item-link';
  addItemLink.innerHTML = '＋ Add Item';
  addItemLink.href = '#';
  addItemLink.addEventListener('click', (e) => {
    e.preventDefault();
    openItemDialog(null, state.dayItemsDate);
  });
  dayItemsListEl.appendChild(addItemLink);

  // highlight the active cell
  document.querySelectorAll('.cell.day-active').forEach(el => el.classList.remove('day-active'));
  const activeCell = document.querySelector(`.cell[data-date="${state.dayItemsDate}"]`);
  if (activeCell) activeCell.classList.add('day-active');
}

if (closeDayPanelBtn) closeDayPanelBtn.addEventListener('click', () => { state.dayItemsDate = null; renderDayItemsPanel(); });
if (todayBtn) todayBtn.addEventListener('click', () => {
  const now = new Date();
  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
  scrollToDate(todayStr);
});

function ensureYearRendered(year, _unusedPrepend = false) {
  if (renderedYears.has(year)) return;
  const section = buildYearSection(year);
  if (!yearsWrapper.firstChild) {
    yearsWrapper.appendChild(section);
  } else if (minRenderedYear !== null && year < minRenderedYear) {
    yearsWrapper.insertBefore(section, yearsWrapper.firstChild);
  } else if (maxRenderedYear !== null && year > maxRenderedYear) {
    yearsWrapper.appendChild(section);
  } else {
    // Insert in the correct sorted position between existing years
    let inserted = false;
    const nodes = Array.from(yearsWrapper.querySelectorAll('.year-section'));
    for (let i = 0; i < nodes.length; i++) {
      const y = Number(nodes[i].dataset.year);
      if (year < y) {
        yearsWrapper.insertBefore(section, nodes[i]);
        inserted = true;
        break;
      }
    }
    if (!inserted) yearsWrapper.appendChild(section);
  }
  renderedYears.add(year);
  if (minRenderedYear === null || year < minRenderedYear) minRenderedYear = year;
  if (maxRenderedYear === null || year > maxRenderedYear) maxRenderedYear = year;
  if (topObserver && yearObserver) {
    topObserver.observe(section);
    yearObserver.observe(section);
  }
}

function buildYearSection(year) {
  const yearSection = document.createElement('div');
  yearSection.className = 'year-section';
  yearSection.dataset.year = String(year);
  yearSection.id = `year-${year}`;

  const yearBadge = document.createElement('div');
  yearBadge.className = 'year-badge';
  yearBadge.textContent = String(year);
  yearBadge.addEventListener('click', () => scrollToYear(year, true));
  yearSection.appendChild(yearBadge);

  const container = document.createElement('div');
  container.className = 'months-grid';
  const weekdayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const now = new Date();
  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
  for (let m = 0; m < 12; m++) {
    const monthEl = document.createElement('div');
    monthEl.className = 'month';
    const h = document.createElement('h3');
    h.innerHTML = `<span>${monthName(m)}</span>`;
    monthEl.appendChild(h);
    const weekdaysEl = document.createElement('div');
    weekdaysEl.className = 'weekdays';
    weekdayLabels.forEach(w => { const s = document.createElement('span'); s.textContent = w; weekdaysEl.appendChild(s); });
    monthEl.appendChild(weekdaysEl);
    const daysEl = document.createElement('div');
    daysEl.className = 'days-grid';
    const daysCount = daysInMonth(year, m);
    const firstWeekday = weekdayIndex(year, m, 1);
    for (let i = 0; i < firstWeekday; i++) { const blank = document.createElement('div'); blank.className = 'cell'; blank.style.visibility = 'hidden'; daysEl.appendChild(blank); }
    for (let d = 1; d <= daysCount; d++) {
      const cell = document.createElement('div'); cell.className = 'cell';
      const dateStr = toDateStr(year, m, d); cell.dataset.date = dateStr;
      if (dateStr === todayStr) { cell.classList.add('today'); }
      const dateBadge = document.createElement('div'); dateBadge.className = 'date'; dateBadge.textContent = d; cell.appendChild(dateBadge);
      const splits = document.createElement('div'); splits.className = 'splits'; cell.appendChild(splits);
      cell.addEventListener('click', () => onCellClick(cell, dateStr));
      cell.addEventListener('mouseenter', (e) => { onCellHoverIn(e, dateStr); });
      cell.addEventListener('mouseleave', () => hideTooltip());
      cell.addEventListener('contextmenu', (e) => onCellRightClick(cell, dateStr, e));
      daysEl.appendChild(cell);
    }
    monthEl.appendChild(daysEl);
    container.appendChild(monthEl);
  }

  yearSection.appendChild(container);
  return yearSection;
}

function scrollToYear(year, smooth = true) {
  ensureYearRendered(year);
  const sec = document.getElementById(`year-${year}`);
  if (!sec) return;
  suppressYearObserver = true;
  if (currentYearEl) currentYearEl.textContent = String(year);
  sec.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  // Re-enable after next frame to avoid flicker
  requestAnimationFrame(() => { requestAnimationFrame(() => { suppressYearObserver = false; }); });
}

function scrollToDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
  ensureYearRendered(y);
  const sec = document.getElementById(`year-${y}`);
  if (!sec) return;
  // Find the cell for the date
  const cell = calendarEl.querySelector(`.cell[data-date="${dateStr}"]`);
  if (cell) {
    // Align the containing month to the top of the scrollable panel, respecting grid gap
    const panelRect = panelEl.getBoundingClientRect();
    const monthEl = cell.closest('.month') || cell;
    const targetRect = monthEl.getBoundingClientRect();
    const gridEl = monthEl.parentElement;
    let gapY = 0;
    if (gridEl) {
      const cs = getComputedStyle(gridEl);
      const rowGap = parseFloat(cs.rowGap || '0') || 0;
      const gap = parseFloat(cs.gap || '0') || 0;
      gapY = rowGap || gap || 0;
    }
    const delta = (targetRect.top - panelRect.top) - gapY;
    panelEl.scrollBy({ top: delta, behavior: 'smooth' });
  } else {
    // As a fallback, scroll the year header into view
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function onCellHoverIn(e, dateStr) {
  if (!state.itemsCache.has(dateStr)) await loadItemsForDate(dateStr);
  const all = getCachedItemsForDate(dateStr);
  const useHighlights = state.highlightEventIds.size > 0;
  const itemsOnDate = useHighlights ? all.filter(it => state.highlightEventIds.has(it.event_id)) : all;
  if (itemsOnDate.length === 0) return;

  const lines = itemsOnDate.slice(0, 6).map(it => {
    const ev = state.events.find(e => e.id === it.event_id);
    const color = ev?.color ?? '#999';
    const evTitle = ev?.title ?? 'Event';
    const time = it.time ? ` • ${escapeHtml(it.time)}` : '';
    const desc = it.description ? `<div class=\"meta\">${escapeHtml(it.description)}</div>` : '';
    return `<div class=\"tip-item\"><span class=\"pill\" style=\"background:${color}\"></span><strong>${escapeHtml(evTitle)}</strong> — ${escapeHtml(it.title)}${time}${desc}</div>`;
  });
  const more = itemsOnDate.length > 6 ? `<div class=\"meta\">+${itemsOnDate.length - 6} more…</div>` : '';
  const html = `<h4>${formatDate(dateStr)}</h4>${lines.join('')}${more}`;
  showTooltip(html, e.clientX, e.clientY);
}

function paintCalendarSelections() {
  const cells = calendarEl.querySelectorAll('.cell');
  cells.forEach(cell => {
    const dateStr = cell.dataset.date; const splits = cell.querySelector('.splits');
    if (!splits) return; splits.innerHTML = ''; if (!dateStr) return;

    // All highlighted events that have items on this date
    const highlighted = state.events.filter(e => state.highlightEventIds.has(e.id));
    const eventsWithItems = [];
    for (const ev of highlighted) {
      const items = getCachedItemsForDate(dateStr).filter(it => it.event_id === ev.id);
      if (items.length > 0) eventsWithItems.push(ev);
    }

    if (eventsWithItems.length > 0) {
      cell.classList.add('colored');
      cell.classList.remove('date-light','date-dark');
      const widthPercent = 100 / eventsWithItems.length;
      // Build splits and use the rightmost split's color for contrast
      let lastColor = null;
      for (const ev of eventsWithItems) {
        const split = document.createElement('div');
        split.className = 'split'; split.style.width = `${widthPercent}%`; split.style.background = ev.color;
        splits.appendChild(split);
        lastColor = ev.color || lastColor;
      }
      const rgb = hexToRgb(lastColor);
      const lum = rgb ? relativeLuminance(rgb) : 0.5;
      if (lum < 0.5) cell.classList.add('date-light'); else cell.classList.add('date-dark');
    } else {
      cell.classList.remove('colored');
      cell.classList.remove('date-light','date-dark');
    }
  });
}

function getCachedItemsForDate(dateStr) { return state.itemsCache.get(dateStr) || []; }
async function loadItemsForDate(dateStr) { const items = await api.get(`/api/items?date=${encodeURIComponent(dateStr)}`); state.itemsCache.set(dateStr, items); }

async function loadItemsForEvent(eventId) {
  const items = await api.get(`/api/items?event_id=${encodeURIComponent(eventId)}`);
  const byDate = new Map();
  for (const it of items) {
    if (!byDate.has(it.date)) byDate.set(it.date, []);
    byDate.get(it.date).push(it);
  }
  for (const [dateStr, entry] of state.itemsCache.entries()) {
    const kept = entry.filter(x => x.event_id !== eventId);
    state.itemsCache.set(dateStr, kept);
  }
  for (const [dateStr, eventItems] of byDate.entries()) {
    const existing = state.itemsCache.get(dateStr) || [];
    state.itemsCache.set(dateStr, [...existing, ...eventItems]);
  }
}

function renderSelectedEventThumbs() {
  const containers = [selectedThumbsEl, eventsThumbsEl];
  const selected = state.events.filter(e => state.highlightEventIds.has(e.id));
  containers.forEach(container => {
    if (!container) return;
    container.innerHTML = '';
    selected.forEach(ev => {
      const t = document.createElement('span');
      t.className = 'thumb';
      t.style.background = ev.color || '#475569';
      t.setAttribute('aria-label', ev.title || 'Event');
      t.setAttribute('role', 'img');
      t.addEventListener('mouseenter', (e) => {
        const html = `<strong>${escapeHtml(ev.title || 'Event')}</strong>`;
        showTooltip(html, e.clientX, e.clientY);
      });
      t.addEventListener('mouseleave', hideTooltip);
      container.appendChild(t);
    });
  });
}

function saveHighlightState() {
  try {
    localStorage.setItem(HIGHLIGHT_KEY, JSON.stringify([...state.highlightEventIds]));
  } catch {}
}

function restoreHighlightState() {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      // Only keep ids that still exist in current events list
      const valid = new Set(state.events.map(e => e.id));
      state.highlightEventIds = new Set(arr.filter(id => valid.has(id)));
    }
  } catch {}
}

function renderEventsList() {
  eventsListEl.innerHTML = '';
  state.events.forEach(ev => {
    const li = document.createElement('li'); li.className = 'event-row';

    const color = document.createElement('span'); color.className = 'event-color'; color.style.background = ev.color;

    const title = document.createElement('div'); title.className = 'event-title'; title.textContent = ev.title;

    // Create event actions
    const actions = document.createElement('div');
    actions.className = 'event-actions';

    // Add sliding draw text
    const drawText = document.createElement('span');
    drawText.className = 'draw-text';
    if (state.drawEventId === ev.id) {
      drawText.textContent = 'Drawing';
      drawText.classList.add('drawing');
    } else {
      drawText.textContent = 'Draw';
    }
    drawText.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (state.drawEventId === ev.id) {
        state.drawEventId = null; // Clear draw mode
        drawText.textContent = 'Draw';
        drawText.classList.remove('drawing');
      } else {
        state.drawEventId = null; // Clear any existing draw mode
        state.drawEventId = ev.id; // Set this event as draw mode
        drawText.textContent = 'Drawing';
        drawText.classList.add('drawing');
      }
      await loadItemsForEvent(ev.id);
      paintCalendarSelections();
    });

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      openEventDialog(ev);
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.del(`/api/events/${ev.id}`);
      window.location.reload();
    });

    actions.appendChild(drawText);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(color); li.appendChild(title); li.appendChild(actions);

    li.addEventListener('click', async () => {
      if (state.highlightEventIds.has(ev.id)) {
        state.highlightEventIds.delete(ev.id);
      } else {
        state.highlightEventIds.add(ev.id);
        await loadItemsForEvent(ev.id);
      }
      state.viewingEventId = ev.id;
      highlightViewingEvent();
      paintCalendarSelections();
      renderItemsPanel();
      renderSelectedEventThumbs();
      saveHighlightState();
    });

    if (state.highlightEventIds.has(ev.id)) li.classList.add('viewing');

    eventsListEl.appendChild(li);
  });
  renderSelectedEventThumbs();
}

function highlightViewingEvent() {
  const rows = eventsListEl.querySelectorAll('.event-row');
  rows.forEach((row, idx) => {
    const ev = state.events[idx];
    if (ev && state.highlightEventIds.has(ev.id)) {
      row.classList.add('viewing');
      row.style.setProperty('--evcolor', ev.color || '#475569');
    } else {
      row.classList.remove('viewing');
      row.style.removeProperty('--evcolor');
    }
  });
}

function renderItemsPanel() {
  itemsListEl.innerHTML = '';
  if (itemsCountEl) itemsCountEl.textContent = '0';
  const selectedIds = new Set(state.highlightEventIds);
  if (selectedIds.size === 0) return;

  const items = [];
  for (const [dateStr, dateItems] of state.itemsCache.entries()) {
    for (const it of dateItems) {
      if (selectedIds.has(it.event_id)) items.push({ ...it, _date: dateStr });
    }
  }

  items.sort((a, b) => a._date.localeCompare(b._date) || a.event_id - b.event_id || a.id - b.id);

  if (itemsCountEl) itemsCountEl.textContent = String(items.length);
  for (const it of items) {
    const ev = state.events.find(e => e.id === it.event_id);
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="row">
        <div class="meta"><span style="display:inline-block;width:10px;height:10px;background:${ev?.color ?? '#999'};border-radius:2px;margin-right:6px"></span>${ev?.title ?? 'Event'} • ${formatDate(it._date)}${it.time ? ' • ' + it.time : ''}</div>
        <div class="actions">
          <button data-action="edit">Edit</button>
          <button data-action="delete">Delete</button>
        </div>
      </div>
      <div class="title">${escapeHtml(it.title)}</div>
      ${it.description ? `<div>${escapeHtml(it.description)}</div>` : ''}
      ${it.notes ? `<div class=\"meta\">${escapeHtml(it.notes)}</div>` : ''}
    `;

    div.querySelector('[data-action="edit"]').addEventListener('click', async () => { openItemDialog(it, it._date); });
    div.querySelector('[data-action="delete"]').addEventListener('click', async () => { await api.del(`/api/items/${it.id}`); await loadItemsForDate(it._date); paintCalendarSelections(); renderItemsPanel(); });

    itemsListEl.appendChild(div);
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[c])); }

function onCellClick(cell, dateStr) {
  if (state.drawEventId) {
    const existingItems = state.itemsCache.get(dateStr) || [];
    const existingItem = existingItems.find(item => item.event_id === state.drawEventId);

    if (existingItem) {
      state.dayItemsDate = dateStr;
      // Ensure items are loaded before rendering the panel
      loadItemsForDate(dateStr).then(() => {
        renderDayItemsPanel();
      });
    } else {
      const event = state.events.find(e => e.id === state.drawEventId);
      const defaultTitle = `${event?.title || 'Event'} - ${formatDate(dateStr)}`;

      api.post('/api/items', {
        event_id: state.drawEventId,
        date: dateStr,
        title: defaultTitle
      }).then(async () => {
        await loadItemsForDate(dateStr);
        paintCalendarSelections();
        renderItemsPanel();
        state.dayItemsDate = dateStr;
        renderDayItemsPanel();
      });
    }
  } else {
    state.dayItemsDate = dateStr;
    // Ensure items are loaded before rendering the panel
    loadItemsForDate(dateStr).then(() => {
      renderDayItemsPanel();
    });
  }
}

function onCellRightClick(cell, dateStr, eventObj) {
  eventObj.preventDefault();

  if (!state.drawEventId) return;

  // Check if this cell has the selected event
  const items = state.itemsCache.get(dateStr) || [];
  const hasSelectedEvent = items.some(item => item.event_id === state.drawEventId);

  if (!hasSelectedEvent) return;

  // Check if event has been modified (has items with non-default titles)
  const eventItems = items.filter(item => item.event_id === state.drawEventId);
  const event = state.events.find(e => e.id === state.drawEventId);
  const hasModifiedItems = eventItems.some(item => {
    const defaultTitle = `${event?.title || 'Event'} - ${formatDate(dateStr)}`;
    return item.title !== defaultTitle || item.time || item.description || item.notes;
  });

  if (hasModifiedItems) {
    // Show confirmation dialog
    if (confirm(`This event has been modified. Are you sure you want to delete all items for "${event?.title}" on ${formatDate(dateStr)}?`)) {
      deleteEventItems(state.drawEventId, dateStr);
    }
  } else {
    // Delete directly
    deleteEventItems(state.drawEventId, dateStr);
  }
}

async function deleteEventItems(eventId, dateStr) {
  const items = state.itemsCache.get(dateStr) || [];
  const eventItems = items.filter(item => item.event_id === eventId);

  // Delete all items for this event on this date
  for (const item of eventItems) {
    await api.del(`/api/items/${item.id}`);
  }

  // Refresh data and UI
  await loadItemsForDate(dateStr);
  paintCalendarSelections();
  renderItemsPanel();
  if (state.dayItemsDate === dateStr) {
    renderDayItemsPanel();
  }
}

function openEventDialog(event) {
  const editingEventId = event?.id ?? null;
  eventDialogTitle.textContent = editingEventId ? 'Edit Event' : 'New Event';
  eventTitleInput.value = event?.title ?? '';
  eventColorInput.value = event?.color ?? getRandomColor();
  eventDialog.showModal();

  if (cancelEventBtn) {
    cancelEventBtn.onclick = () => {
      eventDialog.close();
    };
  }

  eventForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!editingEventId) {
      await api.post('/api/events', { title: eventTitleInput.value, color: eventColorInput.value });
    } else {
      await api.patch(`/api/events/${editingEventId}`, { title: eventTitleInput.value, color: eventColorInput.value });
    }
    eventDialog.close();
    await refreshEvents();
  };
}

function openItemDialog(item, dateStr) {
  currentEditItemDate = dateStr;
  itemDialogTitle.textContent = item?.id ? 'Edit Item' : `New Item (${formatDate(dateStr)})`;

  // Populate custom event dropdown with color thumbnails
  const eventContainer = document.getElementById('itemEventContainer');
  const eventDisplay = document.getElementById('itemEventDisplay');
  const eventDropdown = document.getElementById('itemEventDropdown');
  const eventInput = document.getElementById('itemEvent');

  // Clear previous content
  eventDropdown.innerHTML = '';

  // Create options with color thumbnails
  state.events.forEach(ev => {
    const option = document.createElement('div');
    option.className = 'select-option';
    option.dataset.value = ev.id;
    option.innerHTML = `
      <span class="color-thumb" style="background: ${ev.color}"></span>
      <span>${ev.title}</span>
    `;

    if (item?.event_id === ev.id) {
      option.classList.add('selected');
      // Set the display
      eventDisplay.innerHTML = `
        <div class="selected-option">
          <span class="color-thumb" style="background: ${ev.color}"></span>
          <span>${ev.title}</span>
        </div>
      `;
      eventInput.value = ev.id;
    }

    option.addEventListener('click', () => {
      // Update display
      eventDisplay.innerHTML = `
        <div class="selected-option">
          <span class="color-thumb" style="background: ${ev.color}"></span>
          <span>${ev.title}</span>
        </div>
      `;
      eventInput.value = ev.id;

      // Update selected state
      eventDropdown.querySelectorAll('.select-option').forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');

      // Close dropdown
      eventContainer.classList.remove('open');
    });

    eventDropdown.appendChild(option);
  });

  // Handle dropdown toggle
  eventDisplay.addEventListener('click', () => {
    eventContainer.classList.toggle('open');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!eventContainer.contains(e.target)) {
      eventContainer.classList.remove('open');
    }
  });

  itemTitleInput.value = item?.title ?? '';
  itemTimeInput.value = item?.time ?? '';
  itemDescriptionInput.value = item?.description ?? '';
  itemNotesInput.value = item?.notes ?? '';

  itemForm.onsubmit = async (e) => {
    e.preventDefault();
    const selectedEventId = parseInt(eventInput.value);

    if (!selectedEventId) {
      alert('Please select an event');
      return;
    }

    if (!item?.id) {
      await api.post('/api/items', {
        event_id: selectedEventId,
        date: currentEditItemDate,
        title: itemTitleInput.value,
        time: itemTimeInput.value || null,
        description: itemDescriptionInput.value || null,
        notes: itemNotesInput.value || null,
      });
      await loadItemsForDate(currentEditItemDate);
    } else {
      await api.patch(`/api/items/${item.id}`, {
        title: itemTitleInput.value,
        time: itemTimeInput.value || null,
        description: itemDescriptionInput.value || null,
        notes: itemNotesInput.value || null,
      });
      await loadItemsForDate(currentEditItemDate);
    }

    itemDialog.close();
    await loadItemsForEvent(selectedEventId);
    paintCalendarSelections();
    renderItemsPanel();
    renderDayItemsPanel();
  };

  itemDialog.showModal();
}



addEventBtn.addEventListener('click', () => openEventDialog(null));
if (prevYearBtn) prevYearBtn.addEventListener('click', () => { state.year -= 1; ensureYearRendered(state.year); scrollToYear(state.year); });
if (nextYearBtn) nextYearBtn.addEventListener('click', () => { state.year += 1; ensureYearRendered(state.year); scrollToYear(state.year); });

async function refreshEvents() {
  const response = await api.get('/api/events');
  state.events = response;

  // Handle preselected events for new users
  if (window.preselectedEventIds && window.preselectedEventIds.length > 0) {
    state.highlightEventIds.clear();
    for (const id of window.preselectedEventIds) {
      if (state.events.some(e => e.id === id)) {
        state.highlightEventIds.add(id);
      }
    }
    window.preselectedEventIds = null; // Clear so it's only applied once
  } else {
    restoreHighlightState();
    state.highlightEventIds = new Set([...state.highlightEventIds].filter(id => state.events.some(e => e.id === id)));
  }

  // Clear draw mode if the event no longer exists
  if (state.drawEventId && !state.events.some(e => e.id === state.drawEventId)) {
    state.drawEventId = null;
  }

  renderEventsList();
  paintCalendarSelections();
}

function applyItemsCollapsedState() {
  const stored = localStorage.getItem('itemsCollapsed');
  const collapsed = stored === null ? true : stored === '1'; // Default to collapsed for new users
  itemsPanelEl.classList.toggle('collapsed', collapsed);
  if (toggleItemsBtn) toggleItemsBtn.textContent = collapsed ? '▸' : '▾';
}

function setupItemsCollapse() {
  applyItemsCollapsedState();
  if (!toggleItemsBtn) return;
  toggleItemsBtn.addEventListener('click', () => {
    const collapsed = !itemsPanelEl.classList.contains('collapsed');
    itemsPanelEl.classList.toggle('collapsed', collapsed);
    localStorage.setItem('itemsCollapsed', collapsed ? '1' : '0');
    toggleItemsBtn.textContent = collapsed ? '▸' : '▾';
  });
}

function applyEventsCollapsedState() {
  const collapsed = localStorage.getItem('eventsCollapsed') === '1';
  eventsPanelEl.classList.toggle('collapsed', collapsed);
  if (toggleEventsBtn) toggleEventsBtn.textContent = collapsed ? '▸' : '▾';
}

function setupEventsCollapse() {
  applyEventsCollapsedState();
  if (!toggleEventsBtn) return;
  toggleEventsBtn.addEventListener('click', () => {
    const collapsed = !eventsPanelEl.classList.contains('collapsed');
    eventsPanelEl.classList.toggle('collapsed', collapsed);
    localStorage.setItem('eventsCollapsed', collapsed ? '1' : '0');
    toggleEventsBtn.textContent = collapsed ? '▸' : '▾';
  });
}

function applySidebarCollapsedState() {
  const collapsed = localStorage.getItem('sidebarCollapsed') === '1';
  layoutEl.classList.toggle('sidebar-collapsed', collapsed);
  if (toggleSidebarBtn) toggleSidebarBtn.textContent = '☰';
}

function setupSidebarCollapse() {
  applySidebarCollapsedState();
  if (!toggleSidebarBtn) return;
  toggleSidebarBtn.addEventListener('click', () => {
    const collapsed = !layoutEl.classList.contains('sidebar-collapsed');
    layoutEl.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
    toggleSidebarBtn.textContent = '☰';
  });
}

async function boot() {
  setupItemsCollapse();
  setupSidebarCollapse();
  await refreshEvents();
  renderCalendar();
  setupEventsCollapse();
  const now = new Date();
  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  // Load items for highlighted events (including preselected ones)
  for (const id of state.highlightEventIds) {
    try {
      await loadItemsForEvent(id);
    } catch {}
  }

  highlightViewingEvent();
  paintCalendarSelections();
  renderSelectedEventThumbs();
  renderItemsPanel();
  state.dayItemsDate = todayStr;
  await loadItemsForDate(todayStr);
  renderDayItemsPanel();
}
boot();

function getRandomColor() {
  // Generate a pleasing pastel-ish color in hex
  const hue = Math.floor(Math.random() * 360);
  const sat = 70; // 0-100
  const light = 55; // 0-100
  // Convert HSL to RGB then to hex
  const c = (1 - Math.abs(2 * light / 100 - 1)) * (sat / 100);
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = light / 100 - c / 2;
  let r = 0, g = 0, b = 0;
  if (0 <= hue && hue < 60) { r = c; g = x; b = 0; }
  else if (60 <= hue && hue < 120) { r = x; g = c; b = 0; }
  else if (120 <= hue && hue < 180) { r = 0; g = c; b = x; }
  else if (180 <= hue && hue < 240) { r = 0; g = x; b = c; }
  else if (240 <= hue && hue < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v) => {
    const n = Math.round((v + m) * 255);
    return n.toString(16).padStart(2, '0');
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}
