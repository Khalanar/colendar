import json
import re
from datetime import datetime, date, timedelta
from typing import Optional
import random

from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import HttpRequest, HttpResponse, JsonResponse, HttpResponseNotAllowed
from django.shortcuts import render, get_object_or_404, redirect
from django.views.decorators.csrf import csrf_exempt
from django.contrib import messages
from django.conf import settings
import time

from .models import Event, EventItem


def get_random_color():
    """Generate a random color in hex format"""
    colors = [
        '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
        '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1',
        '#14B8A6', '#F43F5E', '#EAB308', '#A855F7', '#0EA5E9'
    ]
    return random.choice(colors)


def create_sample_data_for_user(user):
    """Create sample events and items for a new user"""
    # Check if user already has events
    if Event.objects.filter(user=user).exists():
        return None

    # Sample event titles
    event_titles = [
        "Work Meetings",
        "Personal Tasks",
        "Health & Fitness",
        "Learning & Study",
        "Social Events",
        "Home Projects"
    ]

    # Sample item titles
    item_titles = [
        "Team standup",
        "Project review",
        "Gym workout",
        "Read documentation",
        "Call with client",
        "Code review",
        "Lunch with team",
        "Weekly planning",
        "Exercise routine",
        "Study session"
    ]

    # Sample descriptions
    descriptions = [
        "Important team discussion",
        "Review project progress",
        "Daily fitness routine",
        "Learning new technology",
        "Client consultation",
        "Code quality check",
        "Team building activity",
        "Plan next week's tasks",
        "Physical activity",
        "Educational content review"
    ]

    # Create 2 random events
    selected_events = random.sample(event_titles, 2)

    today = date.today()
    tomorrow = today + timedelta(days=1)

    # Get a random day this week (not today or tomorrow)
    days_this_week = []
    for i in range(7):
        day = today + timedelta(days=i)
        if day != today and day != tomorrow:
            days_this_week.append(day)
    other_day_this_week = random.choice(days_this_week)

    # Event 1: Items today and tomorrow
    event1 = Event.objects.create(
        title=selected_events[0],
        color=get_random_color(),
        user=user
    )

    # Create items for event 1 (today and tomorrow)
    for day in [today, tomorrow]:
        num_items = random.randint(1, 2)  # 1-2 items per day
        for _ in range(num_items):
            item_title = random.choice(item_titles)
            description = random.choice(descriptions)

            # Random time between 9 AM and 5 PM
            hour = random.randint(9, 17)
            minute = random.choice([0, 15, 30, 45])
            time_str = f"{hour:02d}:{minute:02d}"

            EventItem.objects.create(
                event=event1,
                title=item_title,
                time=time_str,
                description=description,
                notes="Sample item - feel free to edit or delete!",
                date=day
            )

    # Event 2: Items tomorrow and another day this week
    event2 = Event.objects.create(
        title=selected_events[1],
        color=get_random_color(),
        user=user
    )

    # Create items for event 2 (tomorrow and another day this week)
    for day in [tomorrow, other_day_this_week]:
        num_items = random.randint(1, 2)  # 1-2 items per day
        for _ in range(num_items):
            item_title = random.choice(item_titles)
            description = random.choice(descriptions)

            # Random time between 9 AM and 5 PM
            hour = random.randint(9, 17)
            minute = random.choice([0, 15, 30, 45])
            time_str = f"{hour:02d}:{minute:02d}"

            EventItem.objects.create(
                event=event2,
                title=item_title,
                time=time_str,
                description=description,
                notes="Sample item - feel free to edit or delete!",
                date=day
            )

    # Return the created event IDs for preselection
    return [event1.id, event2.id]


@login_required
def index(request: HttpRequest) -> HttpResponse:
    if not request.user.is_authenticated:
        return redirect('account_login')

    # Create sample data for new users and get preselected event IDs
    preselected_event_ids = create_sample_data_for_user(request.user)

    context = {
        'timestamp': int(time.time()),  # Cache busting for JavaScript
        'preselected_event_ids': preselected_event_ids,
        'debug': settings.DEBUG
    }
    return render(request, "core/index.html", context)


@login_required
def settings_view(request):
    if not request.user.is_authenticated:
        return redirect('account_login')

    if request.method == 'POST':
        # Handle settings updates
        username = request.POST.get('username')
        email = request.POST.get('email')
        first_name = request.POST.get('first_name')
        last_name = request.POST.get('last_name')

        # Clear any existing messages
        from django.contrib.messages import get_messages
        list(get_messages(request))

        if username and username != request.user.username:
            if User.objects.filter(username=username).exclude(id=request.user.id).exists():
                messages.error(request, 'Username already taken')
            else:
                request.user.username = username
                request.user.save()
                messages.success(request, 'Username updated successfully')

        if email and email != request.user.email:
            if User.objects.filter(email=email).exclude(id=request.user.id).exists():
                messages.error(request, 'Email already taken')
            else:
                request.user.email = email
                request.user.save()
                messages.success(request, 'Email updated successfully')

        if first_name != request.user.first_name:
            request.user.first_name = first_name or ''
            request.user.save()
            messages.success(request, 'First name updated successfully')

        if last_name != request.user.last_name:
            request.user.last_name = last_name or ''
            request.user.save()
            messages.success(request, 'Last name updated successfully')

        # Redirect to prevent form resubmission
        return redirect('settings')

    return render(request, "core/settings.html")


@login_required
def event_detail_page(request, event_id):
    """Display a detailed view of an event with all its items"""
    event = get_object_or_404(Event, id=event_id, user=request.user)
    items = EventItem.objects.filter(event=event).order_by('date', 'time')

    context = {
        'event': event,
        'items': items,
    }
    return render(request, "core/event_detail.html", context)


def _json(request: HttpRequest) -> dict:
    if request.body:
        try:
            return json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


@login_required
@csrf_exempt
def events_api(request, event_id=None):
    if request.method == 'GET':
        if event_id:
            event = get_object_or_404(Event, id=event_id, user=request.user)
            return JsonResponse(event.to_dict())
        else:
            events = Event.objects.filter(user=request.user)
            return JsonResponse([event.to_dict() for event in events], safe=False)
    elif request.method == 'POST':
        data = json.loads(request.body)
        event = Event.objects.create(
            title=data['title'],
            color=data['color'],
            user=request.user
        )
        return JsonResponse(event.to_dict(), status=201)
    elif request.method == 'PUT':
        data = json.loads(request.body)
        event = Event.objects.get(id=data['id'], user=request.user)
        event.title = data['title']
        event.color = data['color']
        event.save()
        return JsonResponse(event.to_dict())
    elif request.method == 'DELETE':
        if event_id:
            # Delete specific event
            event = get_object_or_404(Event, id=event_id, user=request.user)
            event.delete()
            return JsonResponse({}, status=204)
        else:
            # Delete event from request body (for backward compatibility)
            data = json.loads(request.body)
            event = Event.objects.get(id=data['id'], user=request.user)
            event.delete()
            return JsonResponse({}, status=204)

# @login_required
def event_detail(request: HttpRequest, event_id: int):
    ev = get_object_or_404(Event, id=event_id, user=request.user)
    if request.method == "PATCH":
        data = _json(request)
        if "title" in data and data["title"] is not None:
            ev.title = data["title"]
        if "color" in data and data["color"] is not None:
            ev.color = data["color"]
        ev.save()
        return JsonResponse(ev.to_dict(include_items=False))
    if request.method == "DELETE":
        ev.delete()
        return HttpResponse(status=204)
    return HttpResponseNotAllowed(["PATCH", "DELETE"])


@login_required
@csrf_exempt
def items_api(request):
    if request.method == 'GET':
        event_id = request.GET.get('event_id')
        date_str = request.GET.get('date')

        if event_id:
            items = EventItem.objects.filter(event_id=event_id, event__user=request.user)
        elif date_str:
            items = EventItem.objects.filter(date=date_str, event__user=request.user)
        else:
            items = EventItem.objects.filter(event__user=request.user)

        return JsonResponse([item.to_dict() for item in items], safe=False)
    elif request.method == 'POST':
        data = json.loads(request.body)
        event = Event.objects.get(id=data['event_id'], user=request.user)
        item = EventItem.objects.create(
            event=event,
            title=data['title'],
            time=data.get('time', ''),
            description=data.get('description', ''),
            notes=data.get('notes', ''),
            date=datetime.strptime(data['date'], '%Y-%m-%d').date()
        )
        return JsonResponse(item.to_dict(), status=201)
    elif request.method == 'PUT':
        data = json.loads(request.body)
        item = EventItem.objects.get(id=data['id'], event__user=request.user)
        item.title = data['title']
        item.time = data.get('time', '')
        item.description = data.get('description', '')
        item.notes = data.get('notes', '')
        item.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        item.save()
        return JsonResponse(item.to_dict())
    elif request.method == 'DELETE':
        data = json.loads(request.body)
        item = EventItem.objects.get(id=data['id'], event__user=request.user)
        item.delete()
        return JsonResponse({}, status=204)


@login_required
@csrf_exempt
def items_collection(request: HttpRequest):
    if request.method == "GET":
        event_id: Optional[str] = request.GET.get("event_id")
        date: Optional[str] = request.GET.get("date")
        qs = EventItem.objects.filter(event__user=request.user)
        if event_id:
            qs = qs.filter(event_id=event_id)
        if date:
            qs = qs.filter(date=date)
        items = [it.to_dict() for it in qs]
        return JsonResponse(items, safe=False)
    if request.method == "POST":
        data = _json(request)
        try:
            parsed_date = datetime.strptime(data.get("date"), "%Y-%m-%d").date()
        except Exception:
            return JsonResponse({"detail": "Invalid date format, expected YYYY-MM-DD"}, status=422)
        try:
            ev = Event.objects.get(id=data.get("event_id"), user=request.user)
        except Event.DoesNotExist:
            return JsonResponse({"detail": "Parent event not found"}, status=404)
        item = EventItem.objects.create(
            event=ev,
            date=parsed_date,
            title=data.get("title") or "",
            time=data.get("time"),
            notes=data.get("notes"),
        )
        return JsonResponse(item.to_dict(), status=201)
    return HttpResponseNotAllowed(["GET", "POST"])


@login_required
@csrf_exempt
def item_detail(request: HttpRequest, item_id: int):
    item = get_object_or_404(EventItem, id=item_id, event__user=request.user)
    if request.method == "PATCH":
        data = _json(request)
        for field in ("title", "time", "notes"):
            if field in data:
                setattr(item, field, data[field])

        # Handle date field separately since it needs parsing
        if "date" in data:
            try:
                parsed_date = datetime.strptime(data["date"], "%Y-%m-%d").date()
                item.date = parsed_date
            except Exception:
                return JsonResponse({"detail": "Invalid date format, expected YYYY-MM-DD"}, status=422)

        item.save()
        return JsonResponse(item.to_dict())
    if request.method == "DELETE":
        item.delete()
        return HttpResponse(status=204)
    return HttpResponseNotAllowed(["PATCH", "DELETE"])


@login_required
def export_event(request, event_id):
    """Export an event and all its items to JSON format"""
    event = get_object_or_404(Event, id=event_id, user=request.user)
    items = EventItem.objects.filter(event=event).order_by('date', 'time')

    # Create JSON export data
    export_data = {
        'event': {
            'title': event.title,
            'color': event.color
        },
        'items': []
    }

    for item in items:
        item_data = {
            'title': item.title,
            'date': item.date.strftime('%Y-%m-%d'),
            'time': item.time or '',
            'notes': item.notes or ''
        }
        export_data['items'].append(item_data)

    # Convert to formatted JSON string
    export_text = json.dumps(export_data, indent=2)

    return JsonResponse({
        'export_text': export_text,
        'event_title': event.title,
        'items_count': items.count()
    })

@login_required
@csrf_exempt
def import_data(request):
    """Import events and items from JSON format"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        import_text = data.get('data', '').strip()

        if not import_text:
            return JsonResponse({'error': 'No data provided'}, status=400)

        events_created = 0
        items_created = 0

        # Parse JSON import data
        try:
            import_data = json.loads(import_text)
        except json.JSONDecodeError as e:
            return JsonResponse({'error': f'Invalid JSON format: {str(e)}'}, status=400)

        # Validate JSON structure
        if 'event' not in import_data or 'items' not in import_data:
            return JsonResponse({'error': 'Invalid JSON structure. Expected "event" and "items" keys.'}, status=400)

        event_data = import_data['event']
        items_data = import_data['items']

        if 'title' not in event_data:
            return JsonResponse({'error': 'Event title is required'}, status=400)

        # Check if event with same name already exists
        event_title = event_data['title']
        existing_event = Event.objects.filter(user=request.user, title=event_title).first()

        if existing_event:
            print(f"Debug: Event '{event_title}' already exists, using existing event")
            current_event = existing_event
        else:
            current_event = Event(
                user=request.user,
                title=event_title,
                color=event_data.get('color', get_random_color())
            )
            current_event.save()
            events_created += 1
            print(f"Debug: Created new event '{event_title}'")

                # Create items
        for item_data in items_data:
            if 'title' not in item_data or 'date' not in item_data:
                print(f"Debug: Skipping item - missing title or date: {item_data}")
                continue

            try:
                # Parse date
                item_date = datetime.strptime(item_data['date'], '%Y-%m-%d').date()

                                # Check if item with same title AND date already exists in this event
                existing_item = EventItem.objects.filter(
                    event=current_event,
                    title=item_data['title'],
                    date=item_date
                ).first()

                if existing_item:
                    print(f"Debug: Item '{item_data['title']}' on date '{item_data['date']}' already exists in event '{event_title}', skipping")
                    continue

                # Create item
                EventItem.objects.create(
                    event=current_event,
                    title=item_data['title'],
                    date=item_date,
                    time=item_data.get('time', ''),
                    description=item_data.get('description', ''),
                    notes=item_data.get('notes', '')
                )
                items_created += 1
                print(f"Debug: Created item '{item_data['title']}' for event '{event_title}'")

            except ValueError as e:
                print(f"Debug: Invalid date format for item '{item_data.get('title', 'Unknown')}': {item_data.get('date', 'No date')}")
                continue
            except Exception as e:
                print(f"Debug: Error creating item '{item_data.get('title', 'Unknown')}': {str(e)}")
                continue

        return JsonResponse({
            'success': True,
            'events_created': events_created,
            'items_created': items_created
        })

    except Exception as e:
        return JsonResponse({'error': f'Import failed: {str(e)}'}, status=400)


@login_required
@csrf_exempt
def strip_dates_from_item_titles(request):
    """Strip trailing date patterns from item titles for the current user's items.
    Patterns removed include:
      - ' - 12th Aug, 2025'
      - ' - 2025-08-12'
      - ' 12th Aug, 2025'
      - ' 2025-08-12'
    Only trailing occurrences are removed to avoid damaging legitimate titles.
    """
    # Regex for common date suffixes at end, optional leading dash/space
    patterns = [
        r"\s*-\s*\d{4}-\d{2}-\d{2}$",              # ' - 2025-08-12'
        r"\s*\d{4}-\d{2}-\d{2}$",                   # ' 2025-08-12'
        r"\s*-\s*\d{1,2}(st|nd|rd|th)\s+[A-Za-z]{3},\s+\d{4}$",  # ' - 12th Aug, 2025'
        r"\s*\d{1,2}(st|nd|rd|th)\s+[A-Za-z]{3},\s+\d{4}$",       # ' 12th Aug, 2025'
    ]

    compiled = [re.compile(p) for p in patterns]

    items = EventItem.objects.filter(event__user=request.user)
    changed = 0
    for it in items:
        original = it.title or ""
        new = original
        for rx in compiled:
            new = rx.sub("", new)
        new = new.strip()
        if new != original:
            it.title = new
            it.save(update_fields=["title"])
            changed += 1

    return JsonResponse({"updated": changed})
