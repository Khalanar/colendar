from django.urls import path, include
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('settings/', views.settings_view, name='settings'),

    # Event detail pages
    path('events/<int:event_id>/', views.event_detail_page, name='event_detail'),

    # API endpoints
    path('api/events', views.events_api, name='events_api'),
    path('api/events/<int:event_id>', views.events_api, name='events_api_detail'),
    path('api/items', views.items_api, name='items_api'),
    path('api/items/<int:item_id>', views.item_detail, name='item_detail'),

    # Export/Import endpoints
    path('api/export/event/<int:event_id>', views.export_event, name='export_event'),
    path('api/import', views.import_data, name='import_data'),
    # Maintenance endpoint to strip date suffixes from item titles
    path('api/maintenance/strip-item-title-dates', views.strip_dates_from_item_titles, name='strip_item_title_dates'),

    path('accounts/', include('allauth.urls')),
]
