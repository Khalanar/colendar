from django.urls import path, include
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('settings/', views.settings_view, name='settings'),
    path('api/events', views.events_collection, name='events_collection'),
    path('api/events/<int:event_id>', views.event_detail, name='event_detail'),
    path('api/items', views.items_collection, name='items_collection'),
    path('api/items/<int:item_id>', views.item_detail, name='item_detail'),
    path('accounts/', include('allauth.urls')),
]
