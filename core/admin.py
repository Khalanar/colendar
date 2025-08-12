from django.contrib import admin
from .models import Event, EventItem


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "color", "user", "created_at", "updated_at")
    list_filter = ("user",)
    search_fields = ("title", "user__username", "user__email")
    ordering = ("id",)


@admin.register(EventItem)
class EventItemAdmin(admin.ModelAdmin):
    list_display = ("id", "event", "date", "title", "time")
    list_filter = ("event", "date", "event__user")
    search_fields = ("title", "description", "notes", "event__title", "event__user__username")
    date_hierarchy = "date"
    ordering = ("date", "id")
    list_select_related = ("event",)
