# Marketing Slides Setup Summary

## Current Status
- ✅ Slides deployed to: https://inquiryinstitute.github.io/martech/
- ✅ Supabase authentication configured
- ✅ Local reveal.js (no CDN dependencies)
- ✅ PDF version available: `castalia-marketing-deck.pdf`
- ✅ Auth state handling fixed - properly waits for Reveal.js to load
- ⚠️ **ACTION REQUIRED**: Configure Supabase redirect URLs (see below)

## Required Configuration

### Supabase Redirect URLs (MUST BE DONE IN DASHBOARD)
The Supabase CLI doesn't support updating redirect URLs - you must do this in the dashboard:

1. Go to: https://supabase.com/dashboard/project/pilmscrodlitdrygabvo/auth/url-configuration

2. **Site URL** (keep as is):
   - `https://castalia.institute`

3. **Redirect URLs** - Add these to the existing list (don't remove existing ones):
   - `https://inquiryinstitute.github.io/martech/**`
   
   Keep any existing URLs like:
   - `https://castalia.institute/**`
   - `https://inquiry.institute/**`

4. Click "Save" at the bottom of the page

5. Test by visiting: https://inquiryinstitute.github.io/martech/

## How It Works

1. User visits https://inquiryinstitute.github.io/martech/
2. If not logged in, shows login screen with Google OAuth
3. After login, Supabase redirects back to the slides
4. Session is stored in localStorage (persists across visits)
5. Slides are rendered using Reveal.js with markdown

## Troubleshooting

### Blank Page
- Check browser console for errors
- Verify you're logged in (check localStorage for `sb-pilmscrodlitdrygabvo-auth-token`)
- Ensure Supabase redirect URLs are configured

### Redirect to Wrong Site
- Update Supabase redirect URLs as shown above
- Clear browser cache and localStorage
- Try logging in again

## Files Structure
```
/
├── index.html                          # Main HTML file
├── castalia-marketing-deck.md          # Markdown slides
├── castalia-marketing-deck.pdf         # PDF version
├── assets/                             # JS/CSS assets
│   ├── index-B7Gn4Usk.js
│   └── index-DpWLtBy4.css
└── reveal/                             # Reveal.js library
    ├── dist/
    └── plugin/
```

## Supabase Credentials
- Project: pilmscrodlitdrygabvo
- URL: https://pilmscrodlitdrygabvo.supabase.co
- Anon Key: (embedded in code)

## Next Steps
1. Configure Supabase redirect URLs (see above)
2. Test login flow
3. Verify slides render correctly
4. Share link with stakeholders
