# Castalia Institute - Marketing Slide Deck

A beautiful, interactive slide deck with Supabase authentication and Google login.

## Features

- **Beautiful Slides**: Powered by Reveal.js
- **Google Authentication**: Secure login with Google accounts
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark/Light Mode**: Automatic theme based on system preference
- **Interactive**: Smooth transitions and animations

## Prerequisites

- Node.js 18+ 
- Supabase account (free tier)
- Google Cloud Console account (for OAuth)

## Setup

### 1. Create Supabase Project

1. Go to [Supabase](https://supabase.com)
2. Create a new project
3. Go to **Authentication** → **Providers** → **Google**
4. Enable Google and add your OAuth credentials
5. Add redirect URI: `http://localhost:5173`
6. Copy your Project URL and anon key

### 2. Configure Environment

```bash
cd frontend
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Open http://localhost:5173

## Deployment

### Deploy to GitHub Pages

1. Update `package.json` homepage:
   ```json
   "homepage": "https://YOUR_USERNAME.github.io/castalia-marketing-slides/"
   ```

2. Deploy:
   ```bash
   npm run deploy
   ```

### Deploy with Custom Domain (Route 53)

1. Configure Route 53 stack:
   ```bash
   cdk deploy -c env=prod
   ```

2. Update GitHub Pages settings to use custom domain

## Project Structure

```
frontend/
├── src/
│   ├── assets/
│   │   └── slide-theme.css
│   ├── App.vue
│   └── main.ts
├── index.html
├── package.json
├── vite.config.ts
└── .env.local
```

## Technologies

- **Vue 3**: Frontend framework
- **Reveal.js**: Slide deck library
- **Supabase**: Authentication and database
- **Vite**: Build tool
- **TypeScript**: Type safety

## License

MIT
