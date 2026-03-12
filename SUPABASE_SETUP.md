# Supabase Authentication Setup

## Overview
This document describes how to set up Supabase authentication for the Castalia Institute marketing slide deck.

## Prerequisites
- GitHub account
- AWS account (for Route 53 domain management)
- Supabase account (free tier)

## Step 1: Create Supabase Project

1. Go to [Supabase](https://supabase.com)
2. Click "Start your project" or "Sign Up"
3. Create a new project:
   - Project name: `castalia-marketing`
   - Database password: (create a strong password)
   - Region: Choose closest to your users
   - Click "Create new project"

## Step 2: Configure Authentication

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Enable **Google** provider:
   - Click "Configure" on Google
   - Get OAuth credentials from [Google Cloud Console](https://console.cloud.google.com/)
   - Create credentials:
     - OAuth client ID
     - OAuth client secret
   - Add authorized redirect URIs:
     - `http://localhost:5173` (development)
     - `https://martech.castalia.institute` (production)
   - Copy the Client ID and Client Secret to Supabase
   - Save

3. Go to **Authentication** → **Settings**
4. Configure:
   - Enable "Enable email confirmations" (optional)
   - Set "Minimum password length" to 6
   - Enable "Allow same email to sign up multiple times" (optional)
   - Save

## Step 3: Get Supabase Credentials

1. Go to **Project Settings** → **API**
2. Copy:
   - **Project URL**: `https://your-project.supabase.co`
   - **anon/public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp frontend/.env.example frontend/.env.local
   ```

2. Update `.env.local` with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## Step 5: Test Authentication

1. Start the development server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

2. Open http://localhost:5173
3. Click "Login with Google"
4. You should be redirected to Google's consent screen
5. After authorization, you should be logged in and see the slides

## Step 6: Deploy to GitHub Pages

1. Create a GitHub repository for the frontend:
   ```bash
   cd frontend
   git init
   git add .
   git commit -m "Initial commit: Castalia marketing slides with Supabase auth"
   git remote add origin https://github.com/YOUR_USERNAME/castalia-marketing-slides.git
   git push -u origin main
   ```

2. Configure GitHub Pages:
   - Go to repository Settings → Pages
   - Source: Deploy from a branch
   - Branch: main
   - Folder: /dist
   - Click Save

3. Update GitHub repository URL in `package.json`:
   ```json
   "homepage": "https://YOUR_USERNAME.github.io/castalia-marketing-slides/",
   ```

4. Deploy:
   ```bash
   npm run deploy
   ```

## Step 7: Configure Route 53 (Optional)

See `cdk/route53-stack.ts` for AWS CDK infrastructure to set up Route 53 DNS records.

## Troubleshooting

### Google Login Not Working
- Check redirect URIs in Google Cloud Console
- Ensure Supabase project URL is in Google's authorized domains
- Check browser console for errors

### Slides Not Loading
- Check network tab for 404 errors
- Verify markdown file path: `/castalia-marketing-deck.md`
- Ensure file is served from correct location

### Authentication Errors
- Verify Supabase credentials in `.env.local`
- Check Supabase project is active
- Review Supabase Auth logs in dashboard

## Security Notes

- Never commit `.env.local` to version control
- Use environment-specific configs for different deployments
- Consider adding rate limiting for production
- Review Supabase Row Level Security (RLS) policies for production
