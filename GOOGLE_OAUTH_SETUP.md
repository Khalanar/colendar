# Google OAuth Setup Guide

Follow these steps to enable Google login for your Colendar application:

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API (or Google Identity API)

## Step 2: Create OAuth 2.0 Credentials

1. In your Google Cloud project, go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client IDs**
3. Set **Application Type** to **Web application**
4. Add these **Authorized redirect URIs**:
   - `http://localhost:8000/accounts/google/login/callback/` (for development)
   - `https://yourdomain.com/accounts/google/login/callback/` (for production)
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

## Step 3: Update Django Settings

Edit `colendar_site/settings.py` and replace the placeholder values:

```python
SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'APP': {
            'client_id': 'YOUR_ACTUAL_CLIENT_ID_HERE',
            'secret': 'YOUR_ACTUAL_CLIENT_SECRET_HERE',
            'key': ''
        },
        'SCOPE': [
            'profile',
            'email',
        ],
        'AUTH_PARAMS': {
            'access_type': 'online',
        }
    }
}
```

## Step 4: Restart Django Server

After updating the settings, restart your Django server:

```bash
python manage.py runserver 8000
```

## Step 5: Test Google Login

1. Visit `http://localhost:8000`
2. You'll be redirected to the beautiful login page
3. Click "Continue with Google"
4. Complete the Google OAuth flow
5. You'll be redirected back to your calendar!

## Troubleshooting

- **"Invalid redirect URI"**: Make sure the redirect URI in Google Cloud Console exactly matches your Django URL
- **"Client ID not found"**: Double-check that you've updated the settings.py file with the correct credentials
- **"Access denied"**: Ensure you've enabled the Google+ API in your Google Cloud project

## Security Notes

- Never commit your actual Client ID and Secret to version control
- Use environment variables in production
- The Client Secret should be kept secure and private
