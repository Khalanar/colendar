const api = {
  async get(path) { const r = await fetch(path); if (!r.ok) throw new Error(`GET ${path} ${r.status}`); return r.json(); },
  async post(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`POST ${path} ${r.status}`);
    return r.json();
  },
  async patch(path, body) {
    const r = await fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`PATCH ${path} ${r.status}`);
    return r.json();
  },
  async del(path) {
    const r = await fetch(path, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrfToken() } });
    if (!r.ok && r.status !== 204) throw new Error(`DELETE ${path} ${r.status}`);
  }
};

function getCsrfToken() {
  const name = 'csrftoken=';
  const parts = document.cookie ? document.cookie.split(';') : [];
  for (let c of parts) {
    c = c.trim();
    if (c.startsWith(name)) return decodeURIComponent(c.slice(name.length));
  }
  return '';
}

let state = {
  year: new Date().getFullYear(),
  events: [],
  drawEventId: null,
  viewingEventId: null,
  highlightEventIds: new Set(),
  itemsCache: new Map(), // date -> items[] for items
  dayItemsDate: null,
  // Multi-selection state
  multiSelectStart: null, // YYYY-MM-DD of first selected cell
  multiSelectEnd: null,   // YYYY-MM-DD of last selected cell
  selectedDates: new Set(), // Set of YYYY-MM-DD strings
};
const HIGHLIGHT_KEY = 'highlightEventIds';
const ORDER_KEY = 'eventOrder';

// Configure marked to make all links open in new tabs and add QR buttons for Google Maps
marked.use({
  renderer: {
    link(href, title, text) {
      // Only handle the case where href is not a string (the actual error)
      if (!href || typeof href !== 'string') {
        return `<a href="#" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text || 'link'}</a>`;
      }

      const isGoogleMaps = href.includes('maps.google.com') || href.includes('goo.gl/maps') || href.includes('maps.app.goo.gl');
      const qrButton = isGoogleMaps ? `<button class="qr-button" onclick="showQRCode('${href}')" title="Show QR code">📱</button>` : '';
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>${qrButton}`;
    }
  }
});

// Drag-and-drop transient state
let dnd = { draggingId: null, indicatorRow: null, indicatorThumb: null };

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
const itemsChevron = document.getElementById('itemsChevron');
const eventsPanelEl = document.querySelector('.events-panel');
const eventsChevron = document.getElementById('eventsChevron');
const dayPanelEl = document.getElementById('dayPanel');
const dayPanelTitleEl = document.getElementById('dayPanelTitle');
const dayItemsListEl = document.getElementById('dayItemsList');
const closeDayPanelBtn = document.getElementById('closeDayPanel');
const todayBtn = document.getElementById('todayBtn') || document.getElementById('scrollToday');
const addEventLink = document.getElementById('addEventLink');
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
const itemDateInput = document.getElementById('itemDate');
const itemTimeInput = document.getElementById('itemTime');
const itemNotesInput = document.getElementById('itemNotes');
const cancelItemBtn = document.getElementById('cancelItem');
const toggleMarkdownBtn = document.getElementById('toggleMarkdown');
const markdownPreview = document.getElementById('markdownPreview');

let currentEditItemDate = null; // YYYY-MM-DD for edit/create dialog

const tooltipEl = document.createElement('div');
tooltipEl.className = 'tooltip';
tooltipEl.style.display = 'none';
document.body.appendChild(tooltipEl);

function showTooltip(html, x, y, position = 'below') {
  tooltipEl.innerHTML = html;

  if (position === 'above') {
    // Position above the element
    tooltipEl.style.left = Math.min(x + 12, window.innerWidth - 340) + 'px';
    tooltipEl.style.top = Math.max(y - 60, 10) + 'px';
  } else {
    // Default: position below the element
    tooltipEl.style.left = Math.min(x + 12, window.innerWidth - 340) + 'px';
    tooltipEl.style.top = Math.min(y + 12, window.innerHeight - 120) + 'px';
  }

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
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const month = months[m - 1];
  const teen = day % 100;
  const last = day % 10;
  let suffix = 'th';

  if (teen >= 11 && teen <= 13) {
    suffix = 'th';
  } else if (last === 1) {
    suffix = 'st';
  } else if (last === 2) {
    suffix = 'nd';
  } else if (last === 3) {
    suffix = 'rd';
  }

  return `${month} ${day}${suffix}, ${y}`;
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

// Markdown functionality
function setupMarkdownToggle() {
  if (!toggleMarkdownBtn || !itemNotesInput || !markdownPreview) return;

  let isPreviewMode = false;

  toggleMarkdownBtn.addEventListener('click', () => {
    isPreviewMode = !isPreviewMode;

    if (isPreviewMode) {
      // Switch to preview mode
      const markdownText = itemNotesInput.value;
      const htmlContent = marked.parse(markdownText);
      markdownPreview.innerHTML = htmlContent;
      itemNotesInput.style.display = 'none';
      markdownPreview.style.display = 'block';
      toggleMarkdownBtn.textContent = 'Edit';
    } else {
      // Switch to edit mode
      itemNotesInput.style.display = 'block';
      markdownPreview.style.display = 'none';
      toggleMarkdownBtn.textContent = 'Preview';
    }
  });

  // Handle paste events for link creation
  itemNotesInput.addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData.getData('text');

    // Check if it looks like a URL
    if (pastedText.match(/^https?:\/\//)) {
      e.preventDefault();
      e.stopPropagation();

      const textarea = itemNotesInput;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = textarea.value.substring(start, end);

      if (selectedText && selectedText.trim()) {
        // Replace selected text with markdown link
        const markdownLink = `[${selectedText}](${pastedText})`;
        const newText = textarea.value.substring(0, start) + markdownLink + textarea.value.substring(end);
        textarea.value = newText;

        // Set cursor position after the link
        textarea.selectionStart = textarea.selectionEnd = start + markdownLink.length;
      } else {
        // Just paste the URL
        const newText = textarea.value.substring(0, start) + pastedText + textarea.value.substring(end);
        textarea.value = newText;
        textarea.selectionStart = textarea.selectionEnd = start + pastedText.length;
      }

      // Prevent any further processing
      return false;
    }
  });
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
          <span class="event-color-indicator" style="background:${ev?.color ?? '#999'}"></span>
          ${escapeHtml(ev?.title ?? 'Event')} • ${formatDate(state.dayItemsDate)}
        </div>
        <div class="actions">
          <button data-action="edit">Edit</button>
          <button data-action="delete">Delete</button>
        </div>
      </div>
      <div class="title">
        <span>${escapeHtml(it.title)}</span>
        ${it.time ? `<span class="item-time">${escapeHtml(it.time)}</span>` : ''}
      </div>
      ${it.notes ? `<div class=\"meta\">${marked.parse(it.notes)}</div>` : ''}
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
    // Inline edit on dblclick of day panel item title
    const tEl = row.querySelector('.title');
    tEl.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startInlineEdit(tEl, it.title, async (newTitle) => {
        await api.patch(`/api/items/${it.id}`, { title: newTitle });
        await loadItemsForDate(state.dayItemsDate);
        paintCalendarSelections();
        renderItemsPanel();
        renderDayItemsPanel();
      });
    });
    dayItemsListEl.appendChild(row);
  }

  // Add "Add Item" link at the bottom
  const addItemContainer = document.createElement('div');
  addItemContainer.className = 'add-item-link-container';
  const addItemLink = document.createElement('a');
  addItemLink.className = 'add-item-link';
  addItemLink.innerHTML = '＋ Add Item';
  addItemLink.href = '#';
  addItemLink.addEventListener('click', (e) => {
    e.preventDefault();
    openItemDialog(null, state.dayItemsDate);
  });
  addItemContainer.appendChild(addItemLink);
  dayItemsListEl.appendChild(addItemContainer);
}

if (closeDayPanelBtn) closeDayPanelBtn.addEventListener('click', () => { state.dayItemsDate = null; renderDayItemsPanel(); });
if (todayBtn) todayBtn.addEventListener('click', () => {
  const now = new Date();
  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
  scrollToDate(todayStr);

  // Select today's cell
  clearMultiSelection();
  state.multiSelectStart = todayStr;
  state.selectedDates.add(todayStr);
  updateVisualSelection();

  // Check if today has events and expand sidebar if needed
  const items = state.itemsCache.get(todayStr) || [];
  const hasEvents = items.length > 0;

  if (hasEvents && layoutEl.classList.contains('sidebar-collapsed')) {
    layoutEl.classList.remove('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', '0');
  }

  // Load items for today and update UI
  loadItemsForDate(todayStr).then(() => {
    renderDayItemsPanel();
  });
});
if (addEventLink) {
  addEventLink.addEventListener('click', (e) => { e.preventDefault(); openEventDialog(null); });
}

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
      cell.addEventListener('click', (e) => onCellClick(cell, dateStr, e));
      cell.addEventListener('mouseenter', (e) => { onCellHoverIn(e, dateStr); });
      cell.addEventListener('mouseleave', (e) => onCellHoverOut(e));
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
  // Immediately preview border if drawing, do not wait for async work
  if (state.drawEventId && e.currentTarget) {
    const drawEv = state.events.find(ev => ev.id === state.drawEventId);
    const color = drawEv?.color || '#7c5cff';
    e.currentTarget.classList.add('draw-hover');
    e.currentTarget.style.setProperty('--draw-border', color);
  }

  if (!state.itemsCache.has(dateStr)) await loadItemsForDate(dateStr);
  const all = getCachedItemsForDate(dateStr);
  const useHighlights = state.highlightEventIds.size > 0;
  const itemsOnDate = useHighlights ? all.filter(it => state.highlightEventIds.has(it.event_id)) : all;

  if (itemsOnDate.length === 0) {
    // No tooltip if nothing to show; keep only draw border preview
    return;
  }

  const lines = itemsOnDate.slice(0, 6).map(it => {
    const ev = state.events.find(e => e.id === it.event_id);
    const color = ev?.color ?? '#999';
          const time = it.time ? ` @${escapeHtml(it.time)}` : '';
      return `<div class=\"tip-item\"><span class=\"pill\" style=\"background:${color}\"></span><strong>${escapeHtml(it.title)}</strong>${time}</div>`;
  });

  const rect = e.clientX && e.clientY ? { x: e.clientX, y: e.clientY } : null;
  if (rect) {
    showTooltip(lines.join(''), rect.x, rect.y, 'above');
  }
}

function onCellHoverOut(e) {
  hideTooltip();
  if (e && e.currentTarget) {
    e.currentTarget.classList.remove('draw-hover');
    e.currentTarget.style.removeProperty('--draw-border');
  }
}

function paintCalendarSelections() {
  const cells = calendarEl.querySelectorAll('.cell');
  cells.forEach(cell => {
    const dateStr = cell.dataset.date; const splits = cell.querySelector('.splits');
    if (!splits) return; splits.innerHTML = ''; if (!dateStr) return;

    const highlighted = state.events.filter(e => state.highlightEventIds.has(e.id));
    const eventsWithItems = [];
    for (const ev of highlighted) {
      const items = getCachedItemsForDate(dateStr).filter(it => it.event_id === ev.id);
      if (items.length > 0) eventsWithItems.push(ev);
    }

    if (eventsWithItems.length > 0) {
      cell.classList.add('colored');
      cell.classList.remove('date-light','date-dark');

      const count = Math.min(eventsWithItems.length, 4);
      const shown = eventsWithItems.slice(0, count);
      let positions = [];
      if (count === 1) {
        positions = [{ left: 0, top: 0, width: 100, height: 100 }];
      } else if (count === 2) {
        positions = [
          { left: 0, top: 0, width: 50, height: 100 },
          { left: 50, top: 0, width: 50, height: 100 },
        ];
      } else if (count === 3) {
        positions = [
          { left: 0, top: 0, width: 50, height: 50 },
          { left: 50, top: 0, width: 50, height: 50 },
          { left: 0, top: 50, width: 100, height: 50 },
        ];
      } else {
        // 4 or more → 2x2; extras ignored
        positions = [
          { left: 0, top: 0, width: 50, height: 50 },
          { left: 50, top: 0, width: 50, height: 50 },
          { left: 0, top: 50, width: 50, height: 50 },
          { left: 50, top: 50, width: 50, height: 50 },
        ];
      }

      let lastColor = null;
      shown.forEach((ev, idx) => {
        const p = positions[idx];
        const seg = document.createElement('div');
        seg.className = 'split';
        seg.style.position = 'absolute';
        seg.style.left = p.left + '%';
        seg.style.top = p.top + '%';
        seg.style.width = p.width + '%';
        seg.style.height = p.height + '%';
        seg.style.background = ev.color;
        splits.appendChild(seg);
        lastColor = ev.color || lastColor;
      });

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

// debounce token to avoid race conditions
let highlightToken = 0;

async function toggleEventHighlight(eventId) {
  const token = ++highlightToken;
  if (state.highlightEventIds.has(eventId)) {
    state.highlightEventIds.delete(eventId);
  } else {
    state.highlightEventIds.add(eventId);
  }

  saveHighlightState();
  renderSelectedEventThumbs();
  // Ensure items are loaded before painting to avoid multi-click jitter
  await loadItemsForEvent(eventId);
  if (token !== highlightToken) return; // a newer toggle occurred, abort
  paintCalendarSelections();

  // Update the visual state of the event row
  const eventRow = document.querySelector(`[data-event-id="${eventId}"]`);
  if (eventRow) {
    if (state.highlightEventIds.has(eventId)) {
      eventRow.classList.add('viewing');
    } else {
      eventRow.classList.remove('viewing');
    }
  }

  // Ensure list thumbnails mirror state even if DOM changed
  highlightViewingEvent();

  // Ensure items panel reflects the current selection
  renderItemsPanel();
}

function renderSelectedEventThumbs() {
  const containers = [selectedThumbsEl, eventsThumbsEl];

  containers.forEach(container => {
    if (!container) return;
    container.innerHTML = '';

    // Show all events, not just selected ones
    state.events.forEach(ev => {
      const isHighlighted = state.highlightEventIds.has(ev.id);
      const t = document.createElement('span');
      t.className = 'thumb';
      t.style.background = isHighlighted ? (ev.color || '#475569') : 'transparent';
      t.style.border = `2px solid ${ev.color || '#666'}`;
      t.style.cursor = 'pointer';
      t.setAttribute('aria-label', ev.title || 'Event');
      t.setAttribute('role', 'img');
      t.setAttribute('data-event-id', String(ev.id));
      t.draggable = true;

      // If this is the HEADER container and this event is the active drawing event, add underline indicator
      if (container === eventsThumbsEl && state.drawEventId === ev.id) {
        t.classList.add('drawing');
        t.style.setProperty('--draw-color', ev.color || '#666');
      }

      // Click handler to toggle visibility (highlight)
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEventHighlight(ev.id);
      });

      // Right-click: set this event as the active drawing event
      t.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.drawEventId = (state.drawEventId === ev.id) ? null : ev.id;
        renderEventsList();
        renderSelectedEventThumbs();
        if (state.drawEventId === ev.id) {
          await loadItemsForEvent(ev.id);
        }
        paintCalendarSelections();
      });

      t.addEventListener('mouseenter', (e) => {
        const html = `<strong>${escapeHtml(ev.title || 'Event')}</strong>`;
        showTooltip(html, e.clientX, e.clientY, 'above');
      });
      t.addEventListener('mouseleave', hideTooltip);

      // DnD handlers (thumbs)
      t.addEventListener('dragstart', (e) => {
        dnd.draggingId = ev.id;
        try { e.dataTransfer.setData('text/event-id', String(ev.id)); } catch {}
        e.dataTransfer.effectAllowed = 'move';
      });
      t.addEventListener('dragend', () => {
        dnd.draggingId = null;
        if (dnd.indicatorThumb && dnd.indicatorThumb.parentNode) dnd.indicatorThumb.parentNode.removeChild(dnd.indicatorThumb);
        dnd.indicatorThumb = null;
      });
      t.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = t.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        if (!dnd.indicatorThumb) {
          const ind = document.createElement('span');
          ind.className = 'drop-indicator-thumb';
          dnd.indicatorThumb = ind;
        }
        // Place indicator before or after this thumb
        if (before) {
          if (t.parentNode.firstChild !== dnd.indicatorThumb || dnd.indicatorThumb.nextSibling !== t) {
            t.parentNode.insertBefore(dnd.indicatorThumb, t);
          }
        } else {
          if (t.nextSibling !== dnd.indicatorThumb) {
            t.parentNode.insertBefore(dnd.indicatorThumb, t.nextSibling);
          }
        }
      });
      t.addEventListener('drop', (e) => {
        e.preventDefault();
        const srcIdStr = (e.dataTransfer && e.dataTransfer.getData('text/event-id')) || String(dnd.draggingId || '');
        const srcId = Number(srcIdStr);
        const dstId = ev.id;
        if (!srcId || srcId === dstId) return;
        const rect = t.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        reorderEvents(srcId, dstId, before ? 'before' : 'after');
        if (dnd.indicatorThumb && dnd.indicatorThumb.parentNode) dnd.indicatorThumb.parentNode.removeChild(dnd.indicatorThumb);
        dnd.indicatorThumb = null;
      });

      container.appendChild(t);
    });
  });
}

function startInlineEdit(targetEl, initialValue, onSave) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = initialValue ?? '';
  input.className = 'inline-edit';
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.addEventListener('click', (e) => { e.stopPropagation(); });
  input.addEventListener('dblclick', (e) => { e.stopPropagation(); });
  const restore = (text) => {
    targetEl.textContent = text;
  };
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (val && val !== initialValue) {
        await onSave(val);
        restore(val);
      } else {
        restore(initialValue);
      }
    } else if (e.key === 'Escape') {
      restore(initialValue);
    }
  });
  input.addEventListener('blur', () => {
    // Do not auto-save on blur per requirement; just restore
    restore(initialValue);
  });
  // Swap content
  targetEl.replaceChildren(input);
  input.focus();
  input.select();
}

// Color picker helper for event color editing
async function pickAndSaveColor(eventId, currentColor) {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = currentColor || '#666666';
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);

  // Track original color and whether we saved
  const evIndex = state.events.findIndex(e => e.id === eventId);
  const originalColor = evIndex >= 0 ? state.events[evIndex].color : (currentColor || '#666666');
  let committed = false;
  let lastPreview = originalColor;

  function applyPreview(color) {
    if (evIndex >= 0) {
      state.events[evIndex].color = color;
      renderSelectedEventThumbs();
      renderEventsList();
      paintCalendarSelections();
    }
  }

  async function commit(color) {
    committed = true;
    try {
      await api.patch(`/api/events/${eventId}`, { color });
      await refreshEvents();
      paintCalendarSelections();
    } catch (err) {
      console.error('Failed to update color', err);
      // revert on failure
      applyPreview(originalColor);
    } finally {
      cleanup();
    }
  }

  function revert() {
    applyPreview(originalColor);
    cleanup();
  }

  // Live preview as the user drags in the picker
  const onInput = (e) => {
    lastPreview = e.target.value;
    applyPreview(lastPreview);
  };

  // Commit on change (dialog closed with OK / Enter in some UIs)
  const onChange = async (e) => {
    await commit(e.target.value);
  };

  const onKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await commit(lastPreview);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      revert();
    }
  };

  const onBlur = () => {
    // If user cancels (no commit), revert preview
    if (!committed) revert();
  };

  function cleanup() {
    input.removeEventListener('input', onInput);
    input.removeEventListener('change', onChange);
    input.removeEventListener('keydown', onKeyDown);
    input.removeEventListener('blur', onBlur);
    input.remove();
  }

  return new Promise((resolve) => {
    input.addEventListener('input', onInput);
    input.addEventListener('change', onChange, { once: true });
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('blur', onBlur, { once: true });
    input.click();
    resolve();
  });
}

// Custom color popover with Save/Cancel; anchored to an element
function openColorPopover(eventId, currentColor, anchorEl, autoOpen = true) {
  const rect = anchorEl.getBoundingClientRect();
  const evIndex = state.events.findIndex(e => e.id === eventId);
  const originalColor = evIndex >= 0 ? state.events[evIndex].color : (currentColor || '#666666');
  let lastPreview = originalColor;
  let committed = false;

  const pop = document.createElement('div');
  pop.className = 'color-popover';
  pop.style.position = 'fixed';
  pop.style.top = `${rect.bottom + 8}px`;
  pop.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
  pop.style.zIndex = '9999';
  pop.style.background = 'var(--panel, #1f2937)';
  pop.style.border = '1px solid var(--border, #334155)';
  pop.style.borderRadius = '8px';
  pop.style.padding = '12px';
  pop.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
  pop.style.display = 'inline-flex';
  pop.style.alignItems = 'center';
  pop.style.gap = '10px';

  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = originalColor;
  picker.style.width = '40px';
  picker.style.height = '40px';
  picker.style.border = 'none';
  picker.style.background = 'transparent';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'btn btn-primary';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'btn btn-secondary';

  function applyPreview(color) {
    if (evIndex >= 0) {
      state.events[evIndex].color = color;
      renderSelectedEventThumbs();
      renderEventsList();
      paintCalendarSelections();
    }
  }

  picker.addEventListener('input', (e) => {
    lastPreview = e.target.value;
    applyPreview(lastPreview);
  });

  async function commit() {
    committed = true;
    try {
      await api.patch(`/api/events/${eventId}`, { color: lastPreview });
      await refreshEvents();
      paintCalendarSelections();
    } finally {
      close();
    }
  }

  function revert() {
    if (!committed) applyPreview(originalColor);
    close();
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); revert(); }
  }

  function onOutside(e) {
    if (!pop.contains(e.target)) revert();
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('mousedown', onOutside);
    pop.remove();
  }

  saveBtn.addEventListener('click', (e) => { e.stopPropagation(); commit(); });
  cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); revert(); });

  pop.appendChild(picker);
  pop.appendChild(saveBtn);
  pop.appendChild(cancelBtn);
  document.body.appendChild(pop);

  // Focus for keyboard support
  picker.focus();
  if (autoOpen) picker.click();
  document.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', onOutside);
}

function isolateEventHighlight(eventId) {
  // Replace current selection with only this event
  state.highlightEventIds = new Set([eventId]);
  saveHighlightState();
  renderSelectedEventThumbs();
  loadItemsForEvent(eventId);
  paintCalendarSelections();
  renderItemsPanel();
  // Re-render list to refresh viewing classes across rows
  renderEventsList();
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

// Order persistence helpers
function loadEventOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(n => Number.isInteger(n)) : null;
  } catch { return null; }
}

function saveEventOrder(orderIds) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(orderIds)); } catch {}
}

function applySavedOrderToEvents() {
  const saved = loadEventOrder();
  if (!saved || saved.length === 0) return;
  const idToEvent = new Map(state.events.map(e => [e.id, e]));
  const ordered = [];
  for (const id of saved) {
    const ev = idToEvent.get(id);
    if (ev) ordered.push(ev);
  }
  // append any new events not in saved order at the end
  for (const ev of state.events) {
    if (!saved.includes(ev.id)) ordered.push(ev);
  }
  state.events = ordered;
}

function deriveAndSaveOrderFromState() {
  const ids = state.events.map(e => e.id);
  saveEventOrder(ids);
}

function reorderEvents(sourceId, targetId, position = 'before') {
  if (sourceId === targetId) return;
  const ids = state.events.map(e => e.id);
  const fromIdx = ids.indexOf(sourceId);
  let toIdx = ids.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return;
  // Adjust target index for after insertion if needed
  if (position === 'after') toIdx = toIdx + (fromIdx < toIdx ? 0 : 1);
  const [moved] = ids.splice(fromIdx, 1);
  ids.splice(toIdx, 0, moved);
  // Rebuild state.events according to new order
  const idToEvent = new Map(state.events.map(e => [e.id, e]));
  state.events = ids.map(id => idToEvent.get(id)).filter(Boolean);
  saveEventOrder(ids);
  renderEventsList();
  renderSelectedEventThumbs();
  paintCalendarSelections();
  renderItemsPanel();
}

function renderEventsList() {
  eventsListEl.innerHTML = '';
  state.events.forEach(ev => {
    const li = document.createElement('li');
    li.className = 'event-row';
    li.setAttribute('data-event-id', ev.id);
    li.draggable = true;

    // No left sliding draw label; actions live on the right

    const color = document.createElement('div');
    color.className = 'event-color';
    // mirror thumb behavior: styling via CSS var
    li.style.setProperty('--evcolor', ev.color || '#666');

    const title = document.createElement('div');
    title.className = 'event-title';
    title.textContent = ev.title;

    // Inline edit on dblclick
    title.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startInlineEdit(title, ev.title, async (newTitle) => {
        await api.patch(`/api/events/${ev.id}`, { title: newTitle });
        await refreshEvents();
      });
    });

    // Create event actions
    const actions = document.createElement('div');
    actions.className = 'event-actions';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'icon-btn';
    viewBtn.setAttribute('aria-label', 'View');
    viewBtn.setAttribute('title', 'View');
    viewBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5c5.05 0 9.27 3.11 10.92 7.5C21.27 16.89 17.05 20 12 20S2.73 16.89 1.08 12.5C2.73 8.11 6.95 5 12 5zm0 2C7.9 7 4.31 9.39 3 12.5 4.31 15.61 7.9 18 12 18s7.69-2.39 9-5.5C19.69 9.39 16.1 7 12 7zm0 2.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
      </svg>
    `;
    viewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`/events/${ev.id}/`, '_blank');
    });

    const drawBtn = document.createElement('button');
    drawBtn.className = 'icon-btn draw-btn';
    drawBtn.textContent = state.drawEventId === ev.id ? 'Stop drawing' : 'Draw';
    if (state.drawEventId === ev.id) drawBtn.classList.add('active');
    drawBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (state.drawEventId === ev.id) {
        state.drawEventId = null;
      } else {
        state.drawEventId = ev.id;
      }
      renderEventsList();
      await loadItemsForEvent(ev.id);
      paintCalendarSelections();
    });

    // Order: eye then Draw
    actions.appendChild(viewBtn);
    actions.appendChild(drawBtn);

    li.appendChild(color);
    li.appendChild(title);
    li.appendChild(actions);

    // Single click handler for the event row
    li.addEventListener('click', async (e) => {
      if (e.metaKey) {
        isolateEventHighlight(ev.id);
      } else {
        toggleEventHighlight(ev.id);
      }
    });

    // Set visual state based on highlight status
    if (state.highlightEventIds.has(ev.id)) {
      li.classList.add('viewing');
    }

    // Set initial state for events in drawing mode
    if (state.drawEventId === ev.id) {
      li.classList.add('drawing-active');
    }

    // Add handlers to mirror thumb behavior
    color.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.metaKey) {
        isolateEventHighlight(ev.id);
      } else {
        toggleEventHighlight(ev.id);
      }
    });
    // Double-click on the small color box: edit color
    color.addEventListener('dblclick', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Open popover and immediately open native picker
      openColorPopover(ev.id, ev.color, color, true);
    });
    color.addEventListener('mouseenter', (e) => {
      const html = `<strong>${escapeHtml(ev.title || 'Event')}</strong>`;
      showTooltip(html, e.clientX, e.clientY, 'above');
    });
    color.addEventListener('mouseleave', () => hideTooltip());

    // DnD handlers (rows)
    li.addEventListener('dragstart', (e) => {
      dnd.draggingId = ev.id;
      try { e.dataTransfer.setData('text/event-id', String(ev.id)); } catch {}
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      dnd.draggingId = null;
      if (dnd.indicatorRow && dnd.indicatorRow.parentNode) dnd.indicatorRow.parentNode.removeChild(dnd.indicatorRow);
      dnd.indicatorRow = null;
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = li.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (!dnd.indicatorRow) {
        const ind = document.createElement('div');
        ind.className = 'drop-indicator';
        dnd.indicatorRow = ind;
      }
      if (before) {
        if (li.previousSibling !== dnd.indicatorRow) {
          li.parentNode.insertBefore(dnd.indicatorRow, li);
        }
      } else {
        if (li.nextSibling !== dnd.indicatorRow) {
          li.parentNode.insertBefore(dnd.indicatorRow, li.nextSibling);
        }
      }
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const srcIdStr = (e.dataTransfer && e.dataTransfer.getData('text/event-id')) || String(dnd.draggingId || '');
      const srcId = Number(srcIdStr);
      const dstId = ev.id;
      if (!srcId || srcId === dstId) return;
      const rect = li.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      reorderEvents(srcId, dstId, before ? 'before' : 'after');
      if (dnd.indicatorRow && dnd.indicatorRow.parentNode) dnd.indicatorRow.parentNode.removeChild(dnd.indicatorRow);
      dnd.indicatorRow = null;
    });

    eventsListEl.appendChild(li);
  });
  renderSelectedEventThumbs();
}

function highlightViewingEvent() {
  const rows = eventsListEl.querySelectorAll('.event-row');
  rows.forEach((row, idx) => {
    const ev = state.events[idx];
    if (!ev) return;
    // Always keep the color variable so borders use the right color even when not viewing
    row.style.setProperty('--evcolor', ev.color || '#475569');
    if (state.highlightEventIds.has(ev.id)) {
      row.classList.add('viewing');
    } else {
      row.classList.remove('viewing');
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
        <div class="meta"><span class="event-color-indicator" style="background:${ev?.color ?? '#999'}"></span>${ev?.title ?? 'Event'} • ${formatDate(it._date)}</div>
        <div class="actions">
          <button data-action="edit">Edit</button>
          <button data-action="delete">Delete</button>
        </div>
      </div>
      <div class="title">
        <span>${escapeHtml(it.title)}</span>
        ${it.time ? `<span class="item-time">${escapeHtml(it.time)}</span>` : ''}
      </div>
      ${it.notes ? `<div class=\"meta\">${marked.parse(it.notes)}</div>` : ''}
    `;

    div.querySelector('[data-action="edit"]').addEventListener('click', async () => { openItemDialog(it, it._date); });
    div.querySelector('[data-action="delete"]').addEventListener('click', async () => { await api.del(`/api/items/${it.id}`); await loadItemsForDate(it._date); paintCalendarSelections(); renderItemsPanel(); });

    // Inline edit on dblclick of title
    const titleEl = div.querySelector('.title');
    titleEl.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startInlineEdit(titleEl, it.title, async (newTitle) => {
        await api.patch(`/api/items/${it.id}`, { title: newTitle });
        await loadItemsForDate(it._date);
        paintCalendarSelections();
        renderItemsPanel();
        if (state.dayItemsDate === it._date) renderDayItemsPanel();
      });
    });

    itemsListEl.appendChild(div);
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[c])); }

function onCellClick(cell, dateStr, event) {
  const isShiftClick = event && event.shiftKey;
  const isCommandClick = event && (event.metaKey || event.ctrlKey);

  if (isShiftClick && state.multiSelectStart) {
    // Multi-selection: select range from start to current cell
    state.multiSelectEnd = dateStr;
    updateMultiSelection();
  } else if (isCommandClick) {
    // Command+Click: toggle individual date selection
    if (state.selectedDates.has(dateStr)) {
      state.selectedDates.delete(dateStr);
      cell.classList.remove('multi-selected');
    } else {
      state.selectedDates.add(dateStr);
      cell.classList.add('multi-selected');
    }

    // Update UI based on selection count
    if (state.selectedDates.size === 0) {
      clearMultiSelection();
    } else {
      // Always use multi-selection panel for Command+Click selections
      loadSelectedDatesItems();
    }

    // Ensure sidebar is expanded
    if (layoutEl.classList.contains('sidebar-collapsed')) {
      layoutEl.classList.remove('sidebar-collapsed');
      localStorage.setItem('sidebarCollapsed', '0');
    }
  } else {
    // Single selection: clear previous selection and start new one
    clearMultiSelection();
    state.multiSelectStart = dateStr;
    state.selectedDates.add(dateStr);

    // Check if this cell has any events and expand sidebar if collapsed
    const items = state.itemsCache.get(dateStr) || [];
    const hasEvents = items.length > 0;

    if (hasEvents && layoutEl.classList.contains('sidebar-collapsed')) {
      layoutEl.classList.remove('sidebar-collapsed');
      localStorage.setItem('sidebarCollapsed', '0');
    }

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
        const eventObj = state.events.find(e => e.id === state.drawEventId);
        // Default title no longer includes the date; just use the event title
        const defaultTitle = `${eventObj?.title || 'Event'}`;

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

  // Visual selection: update day-active class (only for non-Command+Click)
  if (!isCommandClick) {
    updateVisualSelection();
  }
}

function clearMultiSelection() {
  state.multiSelectStart = null;
  state.multiSelectEnd = null;
  state.selectedDates.clear();
  // Clear visual selection
  document.querySelectorAll('.cell.multi-selected').forEach(el => el.classList.remove('multi-selected'));
}

function updateMultiSelection() {
  if (!state.multiSelectStart || !state.multiSelectEnd) return;

  // Clear previous selection
  state.selectedDates.clear();
  document.querySelectorAll('.cell.multi-selected').forEach(el => el.classList.remove('multi-selected'));

  // Get all dates between start and end (inclusive)
  let startDate = new Date(state.multiSelectStart);
  let endDate = new Date(state.multiSelectEnd);

  // Ensure start is before end
  if (startDate > endDate) {
    [state.multiSelectStart, state.multiSelectEnd] = [state.multiSelectEnd, state.multiSelectStart];
    [startDate, endDate] = [endDate, startDate];
  }

  // Add all dates in range to selection
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = toDateStr(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    state.selectedDates.add(dateStr);

    // Add visual selection
    const cell = document.querySelector(`[data-date="${dateStr}"]`);
    if (cell) {
      cell.classList.add('multi-selected');
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Ensure sidebar is expanded for multi-selection
  if (layoutEl.classList.contains('sidebar-collapsed')) {
    layoutEl.classList.remove('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', '0');
  }

  // Load items for all selected dates and update UI
  loadSelectedDatesItems();
}

function renderItemsInPanel(items, dateStr) {
  if (!dayItemsListEl) return;

  dayItemsListEl.innerHTML = '';

  if (items.length === 0) {
    const noItemsEl = document.createElement('div');
    noItemsEl.className = 'empty-day';
    noItemsEl.textContent = 'Nothing to see here!';
    dayItemsListEl.appendChild(noItemsEl);
  } else {
    items.forEach(item => {
      const ev = state.events.find(e => e.id === item.event_id);
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div class="row">
          <div class="meta">
            <span class="event-color-indicator" style="background:${ev?.color ?? '#999'}"></span>
            ${escapeHtml(ev?.title ?? 'Event')} • ${formatDate(dateStr)}
          </div>
          <div class="actions">
            <button data-action="edit">Edit</button>
            <button data-action="delete">Delete</button>
          </div>
        </div>
        <div class="title">
          <span>${escapeHtml(item.title)}</span>
          ${item.time ? `<span class="item-time">${escapeHtml(item.time)}</span>` : ''}
        </div>
        ${item.notes ? `<div class=\"meta\">${marked.parse(item.notes)}</div>` : ''}
      `;

      const editBtn = row.querySelector('[data-action="edit"]');
      const delBtn = row.querySelector('[data-action="delete"]');
      if (editBtn) editBtn.addEventListener('click', () => openItemDialog(item, dateStr));
      if (delBtn) delBtn.addEventListener('click', async () => {
        await api.del(`/api/items/${item.id}`);
        await loadItemsForDate(dateStr);
        paintCalendarSelections();
        renderItemsPanel();
        renderMultiSelectionPanel();
      });

      dayItemsListEl.appendChild(row);
    });
  }

  // Add "Add Item" link
  const addItemContainer = document.createElement('div');
  addItemContainer.className = 'add-item-link-container';
  const addItemLink = document.createElement('a');
  addItemLink.className = 'add-item-link';
  addItemLink.innerHTML = '＋ Add Item';
  addItemLink.href = '#';
  addItemLink.addEventListener('click', (e) => {
    e.preventDefault();
    openItemDialog(null, dateStr);
  });
  addItemContainer.appendChild(addItemLink);
  dayItemsListEl.appendChild(addItemContainer);
}

function updateVisualSelection() {
  // Clear previous visual selection
  document.querySelectorAll('.cell.day-active').forEach(el => el.classList.remove('day-active'));

  if (state.selectedDates.size === 1) {
    // Single selection: highlight the selected cell
    const dateStr = Array.from(state.selectedDates)[0];
    const cell = document.querySelector(`[data-date="${dateStr}"]`);
    if (cell) {
      cell.classList.add('day-active');
    }
  }
  // For multi-selection, don't add day-active class to avoid conflicting styling
}

async function loadSelectedDatesItems() {
  // Load items for all selected dates
  for (const dateStr of state.selectedDates) {
    await loadItemsForDate(dateStr);
  }

  // Update UI to show items from all selected dates
  renderMultiSelectionPanel();
}

function renderMultiSelectionPanel() {
  if (state.selectedDates.size === 0) {
    // No selection, hide multi-selection panel
    if (dayPanelEl) {
      dayPanelEl.style.display = 'none';
    }
    return;
  }

  if (state.selectedDates.size === 1) {
    // Single Command+Click selection, show single date in multi-selection format
    const dateStr = Array.from(state.selectedDates)[0];

    // Show multi-selection panel
    if (dayPanelEl) {
      dayPanelEl.style.display = 'block';
    }

    // Update panel title to show single date
    if (dayPanelTitleEl) {
      dayPanelTitleEl.textContent = formatDate(dateStr);
    }

    // Load and display items for the single date
    loadItemsForDate(dateStr).then(() => {
      const items = state.itemsCache.get(dateStr) || [];
      renderItemsInPanel(items, dateStr);
    });
    return;
  }

  // Multi-selection: show items from all selected dates
  if (dayPanelEl) {
    dayPanelEl.style.display = 'block';
  }

  // Update panel title to show date range
  const dates = Array.from(state.selectedDates).sort();
  const startDate = formatDate(dates[0]);
  const endDate = formatDate(dates[dates.length - 1]);

      // For ranges, show "Month Day - Month Day, Year" format
  const [startY, startM, startD] = dates[0].split('-').map(n => parseInt(n, 10));
  const [endY, endM, endD] = dates[dates.length - 1].split('-').map(n => parseInt(n, 10));
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const getOrdinalSuffix = (day) => {
    const teen = day % 100;
    const last = day % 10;
    if (teen >= 11 && teen <= 13) return 'th';
    if (last === 1) return 'st';
    if (last === 2) return 'nd';
    if (last === 3) return 'rd';
    return 'th';
  };

  const startMonth = months[startM - 1];
  const endMonth = months[endM - 1];
  const startSuffix = getOrdinalSuffix(startD);
  const endSuffix = getOrdinalSuffix(endD);

  const title = `${startMonth} ${startD}${startSuffix} - ${endMonth} ${endD}${endSuffix}, ${startY}`;

  if (dayPanelTitleEl) {
    dayPanelTitleEl.textContent = title;
  }

  // Collect all items from selected dates
  const allItems = [];
  for (const dateStr of dates) {
    const items = state.itemsCache.get(dateStr) || [];
    allItems.push(...items.map(item => ({ ...item, _date: dateStr })));
  }

  // Sort items by date, then by time
  allItems.sort((a, b) => {
    if (a._date !== b._date) {
      return a._date.localeCompare(b._date);
    }
    if (a.time && b.time) {
      return a.time.localeCompare(b.time);
    }
    return (a.time || '').localeCompare(b.time || '');
  });

  // Render items
  if (dayItemsListEl) {
    dayItemsListEl.innerHTML = '';

    if (allItems.length === 0) {
      const noItemsEl = document.createElement('div');
      noItemsEl.className = 'empty-day';
      noItemsEl.textContent = 'No items in selected range';
      dayItemsListEl.appendChild(noItemsEl);
    } else {
      allItems.forEach(item => {
        const ev = state.events.find(e => e.id === item.event_id);
        const row = document.createElement('div');
        row.className = 'item';
        row.innerHTML = `
          <div class="row">
            <div class="meta">
              <span class="event-color-indicator" style="background:${ev?.color ?? '#999'}"></span>
              ${escapeHtml(ev?.title ?? 'Event')} • ${formatDate(item._date)}
            </div>
            <div class="actions">
              <button data-action="edit">Edit</button>
              <button data-action="delete">Delete</button>
            </div>
          </div>
          <div class="title">
            <span>${escapeHtml(item.title)}</span>
            ${item.time ? `<span class="item-time">${escapeHtml(item.time)}</span>` : ''}
          </div>
          ${item.notes ? `<div class=\"meta\">${escapeHtml(item.notes)}</div>` : ''}
        `;

        const editBtn = row.querySelector('[data-action="edit"]');
        const delBtn = row.querySelector('[data-action="delete"]');
        if (editBtn) editBtn.addEventListener('click', () => openItemDialog(item, item._date));
        if (delBtn) delBtn.addEventListener('click', async () => {
          await api.del(`/api/items/${item.id}`);
          await loadItemsForDate(item._date);
          paintCalendarSelections();
          renderItemsPanel();
          renderMultiSelectionPanel();
        });

        dayItemsListEl.appendChild(row);
      });
    }

    // Add "Add Item" link for multi-selection
    const addItemContainer = document.createElement('div');
    addItemContainer.className = 'add-item-link-container';
    const addItemLink = document.createElement('a');
    addItemLink.className = 'add-item-link';
    addItemLink.innerHTML = '＋ Add Item to Range';
    addItemLink.href = '#';
    addItemLink.addEventListener('click', (e) => {
      e.preventDefault();
      openMultiItemDialog();
    });
    addItemContainer.appendChild(addItemLink);
    dayItemsListEl.appendChild(addItemContainer);
  }
}

function openMultiItemDialog() {
  // Open item dialog for multi-day creation
  const firstDate = Array.from(state.selectedDates).sort()[0];
  openItemDialog(null, firstDate);
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
    return item.title !== defaultTitle || item.time || item.notes;
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

  // Find the selected event - for existing items use item.event_id, for new items use drawEventId
  const eventId = item?.event_id || state.drawEventId;
  const selectedEvent = state.events.find(ev => ev.id === eventId);

  // Create options with color thumbnails
  state.events.forEach(ev => {
    const option = document.createElement('div');
    option.className = 'select-option';
    option.dataset.value = ev.id;
    option.innerHTML = `
      <span class="color-thumb" style="background: ${ev.color}"></span>
      <span>${ev.title}</span>
    `;

    if (ev.id === eventId) {
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
  itemDateInput.value = item?.date ?? dateStr;
  itemTimeInput.value = item?.time ?? '';
  itemNotesInput.value = item?.notes ?? '';

  // Set up markdown functionality
  setupMarkdownToggle();

  // Handle cancel button
  if (cancelItemBtn) {
    cancelItemBtn.onclick = () => {
      itemDialog.close();
    };
  }

  itemForm.onsubmit = async (e) => {
    e.preventDefault();
    const selectedEventId = parseInt(eventInput.value);
    const selectedDate = itemDateInput.value;

    if (!selectedEventId) {
      alert('Please select an event');
      return;
    }

    if (!selectedDate) {
      alert('Please select a date');
      return;
    }

    if (!item?.id) {
      // Check if we're in multi-selection mode
      if (state.selectedDates.size > 1) {
        // Create items for all selected dates
        const dates = Array.from(state.selectedDates).sort();
        for (const dateStr of dates) {
          await api.post('/api/items', {
            event_id: selectedEventId,
            date: dateStr,
            title: itemTitleInput.value,
            time: itemTimeInput.value || null,
            notes: itemNotesInput.value || null,
          });
          await loadItemsForDate(dateStr);
        }
      } else {
        // Single item creation
        await api.post('/api/items', {
          event_id: selectedEventId,
          date: selectedDate,
          title: itemTitleInput.value,
          time: itemTimeInput.value || null,
          notes: itemNotesInput.value || null,
        });
        await loadItemsForDate(selectedDate);
      }
    } else {
      const oldDate = item.date;
      await api.patch(`/api/items/${item.id}`, {
        date: selectedDate,
        title: itemTitleInput.value,
        time: itemTimeInput.value || null,
        notes: itemNotesInput.value || null,
      });
      // Reload items for both old and new dates
      await loadItemsForDate(oldDate);
      await loadItemsForDate(selectedDate);
    }

    itemDialog.close();
    await loadItemsForEvent(selectedEventId);
    paintCalendarSelections();
    renderItemsPanel();

    // Update the appropriate panel based on selection
    if (state.selectedDates.size > 1) {
      renderMultiSelectionPanel();
    } else {
      renderDayItemsPanel();
    }
  };

  itemDialog.showModal();
}



if (prevYearBtn) prevYearBtn.addEventListener('click', () => { state.year -= 1; ensureYearRendered(state.year); scrollToYear(state.year); });
if (nextYearBtn) nextYearBtn.addEventListener('click', () => { state.year += 1; ensureYearRendered(state.year); scrollToYear(state.year); });

async function refreshEvents() {
  const response = await api.get('/api/events');
  state.events = response;

  // Apply saved order if present; otherwise save current order as baseline
  const existingOrder = loadEventOrder();
  if (existingOrder && existingOrder.length > 0) {
    applySavedOrderToEvents();
  } else {
    deriveAndSaveOrderFromState();
  }

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
}

function setupItemsCollapse() {
  applyItemsCollapsedState();
  const header = itemsPanelEl.querySelector('.panel-header');
  if (!header) return;
  header.addEventListener('click', (e) => {
    // Ignore clicks on thumbnails or within selected-thumbs
    if (e.target.closest('.selected-thumbs')) return;
    const collapsed = !itemsPanelEl.classList.contains('collapsed');
    itemsPanelEl.classList.toggle('collapsed', collapsed);
    localStorage.setItem('itemsCollapsed', collapsed ? '1' : '0');
  });
}

function applyEventsCollapsedState() {
  const collapsed = localStorage.getItem('eventsCollapsed') === '1';
  eventsPanelEl.classList.toggle('collapsed', collapsed);
}

function setupEventsCollapse() {
  applyEventsCollapsedState();
  const header = eventsPanelEl.querySelector('.panel-header');
  if (!header) return;
  header.addEventListener('click', (e) => {
    // Ignore clicks on thumbnails or within selected-thumbs
    if (e.target.closest('.selected-thumbs')) return;
    const collapsed = !eventsPanelEl.classList.contains('collapsed');
    eventsPanelEl.classList.toggle('collapsed', collapsed);
    localStorage.setItem('eventsCollapsed', collapsed ? '1' : '0');
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

  // Scroll to today on initial load
  scrollToDate(todayStr);

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

// Global: ESC clears drawing mode
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.drawEventId) {
      state.drawEventId = null;
      renderEventsList();
      renderSelectedEventThumbs();
      paintCalendarSelections();
    }
  }
});

// QR Code functionality
function showQRCode(url) {
  // Create QR code using a simple API
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'qr-modal';
  modal.innerHTML = `
    <div class="qr-modal-content">
      <div class="qr-modal-header">
        <h3>Scan QR Code</h3>
        <button class="qr-close-btn" onclick="closeQRModal()">×</button>
      </div>
      <div class="qr-modal-body">
        <img src="${qrCodeUrl}" alt="QR Code" />
        <p>Scan this QR code with your phone to open the location in Google Maps</p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeQRModal();
    }
  });
}

function closeQRModal() {
  const modal = document.querySelector('.qr-modal');
  if (modal) {
    modal.remove();
  }
}
