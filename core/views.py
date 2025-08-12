import json
from datetime import datetime, date, timedelta
from typing import Optional
import random

from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import HttpRequest, HttpResponse, JsonResponse, HttpResponseNotAllowed
from django.shortcuts import render, get_object_or_404, redirect
from django.views.decorators.csrf import csrf_exempt
from django.contrib import messages
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
        return

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


@login_required
def index(request: HttpRequest) -> HttpResponse:
    if not request.user.is_authenticated:
        return redirect('account_login')

    # Create sample data for new users
    create_sample_data_for_user(request.user)

    context = {
        'timestamp': int(time.time())  # Cache busting for JavaScript
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

        if username and username != request.user.username:
            if User.objects.filter(username=username).exists():
                messages.error(request, 'Username already taken')
            else:
                request.user.username = username
                request.user.save()
                messages.success(request, 'Username updated successfully')

        if email and email != request.user.email:
            if User.objects.filter(email=email).exists():
                messages.error(request, 'Email already taken')
            else:
                request.user.email = email
                request.user.save()
                messages.success(request, 'Email updated successfully')

    return render(request, "core/settings.html")


def _json(request: HttpRequest) -> dict:
    if request.body:
        try:
            return json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


@login_required
@csrf_exempt
def events_api(request):
    if request.method == 'GET':
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
            description=data.get("description"),
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
        for field in ("title", "time", "description", "notes"):
            if field in data:
                setattr(item, field, data[field])
        item.save()
        return JsonResponse(item.to_dict())
    if request.method == "DELETE":
        item.delete()
        return HttpResponse(status=204)
    return HttpResponseNotAllowed(["PATCH", "DELETE"])
