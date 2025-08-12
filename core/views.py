import json
from datetime import datetime
from typing import Optional

from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import HttpRequest, HttpResponse, JsonResponse, HttpResponseNotAllowed
from django.shortcuts import render, get_object_or_404, redirect
from django.views.decorators.csrf import csrf_exempt
from django.contrib import messages
import time

from .models import Event, EventItem


# @login_required
def index(request: HttpRequest) -> HttpResponse:
    return render(request, "core/index.html")


# @login_required
def settings_view(request):
    return render(request, 'core/settings.html')


def _json(request: HttpRequest) -> dict:
    if request.body:
        try:
            return json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


# @login_required
def events_api(request):
    if request.method == 'GET':
        events = Event.objects.all()  # Remove user filter temporarily
        return JsonResponse([event.to_dict() for event in events], safe=False)
    elif request.method == 'POST':
        data = json.loads(request.body)
        event = Event.objects.create(
            title=data['title'],
            color=data['color'],
            user=request.user if request.user.is_authenticated else None
        )
        return JsonResponse(event.to_dict(), status=201)
    elif request.method == 'PUT':
        data = json.loads(request.body)
        event = Event.objects.get(id=data['id'])
        event.title = data['title']
        event.color = data['color']
        event.save()
        return JsonResponse(event.to_dict())
    elif request.method == 'DELETE':
        data = json.loads(request.body)
        event = Event.objects.get(id=data['id'])
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


# @login_required
def items_api(request):
    if request.method == 'GET':
        event_id = request.GET.get('event_id')
        date_str = request.GET.get('date')

        if event_id:
            items = EventItem.objects.filter(event_id=event_id)  # Remove user filter temporarily
        elif date_str:
            items = EventItem.objects.filter(date=date_str)  # Remove user filter temporarily
        else:
            items = EventItem.objects.all()  # Remove user filter temporarily

        return JsonResponse([item.to_dict() for item in items], safe=False)
    elif request.method == 'POST':
        data = json.loads(request.body)
        event = Event.objects.get(id=data['event_id'])
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
        item = EventItem.objects.get(id=data['id'])
        item.title = data['title']
        item.time = data.get('time', '')
        item.description = data.get('description', '')
        item.notes = data.get('notes', '')
        item.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        item.save()
        return JsonResponse(item.to_dict())
    elif request.method == 'DELETE':
        data = json.loads(request.body)
        item = EventItem.objects.get(id=data['id'])
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
