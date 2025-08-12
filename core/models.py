from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Event(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=200)
    color = models.CharField(max_length=7)  # e.g. #RRGGBB
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def to_dict(self, include_items: bool = True) -> dict:
        data = {
            "id": self.id,
            "title": self.title,
            "color": self.color,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items.all()]
        return data


class EventItem(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="items")
    date = models.DateField()
    title = models.CharField(max_length=255)
    time = models.CharField(max_length=16, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "event_id": self.event_id,
            "date": self.date.isoformat(),
            "title": self.title,
            "time": self.time,
            "description": self.description,
            "notes": self.notes,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
