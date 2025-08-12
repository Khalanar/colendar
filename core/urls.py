from django.urls import path, include
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('settings/', views.settings_view, name='settings'),
    path('api/events', views.events_api, name='events_api'),
    path('api/events/<int:event_id>', views.events_api, name='events_api_detail'),
    path('api/items', views.items_api, name='items_api'),
    path('api/items/<int:item_id>', views.item_detail, name='item_detail'),
    path('accounts/', include('allauth.urls')),
]
