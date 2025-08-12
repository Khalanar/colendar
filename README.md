# Colendar

A modern, minimalist calendar app with color‑coded events and fast item entry. Built with Django, vanilla JavaScript, and CSS.

## Features
- Full‑year view with simple square day cells arranged in weekday columns; months in a 4‑column grid
- Infinite year scrolling with smooth insertion in chronological order
- Click “Today” to scroll the calendar to the current month (aligned cleanly with grid gap)
- Event model (title, color) and Item model (title, time, description, notes)
- Selecting events:
  - Radio button selects a single “draw” event for quick item creation
  - Clicking event rows toggles them as “highlighted” (multiple allowed) to color the calendar and list items
- Calendar coloring:
  - Cells only show colors where highlighted events actually have items
  - Multiple events per day split the cell into proportional color bands
  - Date numbers auto‑switch light/dark for contrast based on the rightmost split color
  - Today and currently selected day have distinct borders
- Fast item creation: when a draw event is selected, clicking a day creates a new item instantly with default title: “Event Title – 10th Aug, 2024”
- Day items panel: clicking a day without a draw event (or with an existing item for the draw event) shows all items for that day
- Right‑click a day cell (with the event selected) to delete that event’s item on that day (confirmation if modified)
- Right sidebar:
  - Collapsible Events panel and Items panel, with state persisted in localStorage
  - Items panel shows all items for all currently highlighted events
  - Items count badge next to “Items” shows the number of listed items
  - Events header shows color thumbnails for highlighted events; hover for instant tooltip with event name
- Sidebar can be collapsed via hamburger in the header; state persisted
- Year badge is clickable to focus that year
- Modern, stylish color palette and refined layout/scrolling

## Tech Stack
- Django 5
- SQLite (default)
- django‑allauth (Google OAuth)
- HTML, Vanilla JavaScript (no framework), CSS

## Project Structure
```
colendar/
├─ colendar_site/              # Django project settings/urls
├─ core/                       # Main app
│  ├─ models.py                # Event, EventItem
│  ├─ views.py                 # Page + JSON API views
│  ├─ urls.py                  # App routes + accounts include
│  ├─ admin.py                 # Admin registration
│  ├─ templates/core/          # index.html, settings.html
│  ├─ templates/account/       # allauth overrides (login, signup, etc.)
│  ├─ templates/socialaccount/ # allauth social fallback
│  └─ static/core/             # styles.css, app.js
├─ GOOGLE_OAUTH_SETUP.md       # Google OAuth step‑by‑step
├─ requirements.txt
└─ README.md
```

## Prerequisites
- Python 3.10+
- macOS/Linux/Windows

## Setup
1) Clone and enter the project directory
```bash
git clone <your-repo-url> colendar
cd colendar
```

2) Create and activate a virtual environment
```bash
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
```

3) Install dependencies
```bash
pip install -r requirements.txt
```

4) Environment variables (Google OAuth; optional initially)
- You can export these in your shell or a .env loader of your choice.
```bash
export GOOGLE_CLIENT_ID="<your-client-id>"
export GOOGLE_CLIENT_SECRET="<your-client-secret>"
```

5) Migrate the database and create a superuser
```bash
python3 manage.py migrate
python3 manage.py createsuperuser
```

6) Run the development server (project uses 8001 by default in examples)
```bash
python3 manage.py runserver 8001
```
Visit http://127.0.0.1:8001/

## Google OAuth (django‑allauth)
- Follow the full guide in `GOOGLE_OAUTH_SETUP.md`.
- Key reminders:
  - In Django Admin → Sites, set domain to `127.0.0.1:8001` (or your chosen host/port)
  - Add the exact Redirect URI and Authorized JavaScript origins in Google Cloud Console
  - Ensure `ALLOWED_HOSTS` in settings includes your host

## Usage Tips
- Login at `/accounts/login/`. Settings at `/settings/`. Logout at `/accounts/logout/`.
- Create events with the “＋” button in Events.
- To add items quickly: pick the radio button for a draw event, then click any calendar day.
- To view all items for specific days: click a day when no draw event is selected (or if the draw event already has an item on that day).
- Toggle one or more events by clicking their rows to highlight them; the calendar colors those days and the Items list aggregates their items.
- Right‑click a colored day (while the event is selected) to delete that event’s item on that day.
- Hover over event color thumbnails (in Events header) for an instant tooltip with the event name.
- Click the year badge to focus that year. Click “Today” to jump to the current month.
- The app persists:
  - Which events are highlighted
  - Whether the sidebar and panels are collapsed

## Admin
- Go to `/admin/` and log in with your superuser.
- Manage `Event` and `EventItem` (search, filters, ordering included).
- All data is per user; API endpoints require login and are filtered by the current user.

## Development Notes
- Frontend is vanilla JS in `core/static/core/app.js`; styles in `core/static/core/styles.css`.
- The main page is `core/templates/core/index.html`.
- Static caching: `index.html` appends a timestamp query to `app.js` to avoid stale caches in dev.
- Infinite year rendering uses `IntersectionObserver`; year sections are inserted in chronological order with minimal reflow.

## Troubleshooting
- `zsh: command not found: python` → use `python3` and ensure the venv is activated.
- `ModuleNotFoundError: No module named 'allauth'` → run `pip install -r requirements.txt` inside the venv.
- `redirect_uri_mismatch` (Google) → verify Sites domain, Redirect URIs, and JS origins exactly match your dev URL.
- Can’t see models in admin → confirm `core/admin.py` exists and you’re using a staff/superuser.

## Contributing
Issues and PRs welcome after initial publish.

## License
Choose a license before publishing (MIT recommended).
