<template>
  <div id="app">
    <!-- Auth Header -->
    <div class="auth-header">
      <h1>Castalia Institute</h1>
      <div v-if="user" class="user-info">
        <span>{{ user.email }}</span>
        <button @click="handleLogout">Logout</button>
      </div>
      <div v-else class="login-buttons">
        <button @click="handleLogin" class="google-btn">
          <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Login with Google
        </button>
      </div>
    </div>

    <!-- Login Required Overlay -->
    <div v-if="!user" class="login-overlay">
      <div class="login-box">
        <h2>Access Required</h2>
        <p>Please sign in with your Google account to view the marketing deck.</p>
        <button @click="handleLogin" class="google-btn">
          <svg class="google-icon" viewBox="0 0 24 24" width="24" height="24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Login with Google
        </button>
      </div>
    </div>

    <!-- Slide Deck Container -->
    <div v-else class="slide-deck">
      <div class="reveal">
        <div class="slides">
          <div v-for="(slide, index) in slides" :key="index" class="slide">
            <h1 v-if="slide.title" class="slide-title">{{ slide.title }}</h1>
            <div v-html="slide.content" class="slide-content"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase, checkAuth, loginWithGoogle, logout as doLogout, getUser } from './main';

const user = ref<any>(null);
const slides = ref<any[]>([]);

// Load slides from markdown
const loadSlides = async () => {
  try {
    const response = await fetch('/martech/castalia-marketing-deck.md');
    const markdown = await response.text();
    
    // Parse markdown into slides
    const slideBlocks = markdown.split(/---\n/);
    
    slides.value = slideBlocks.map((block, index) => {
      const lines = block.trim().split('\n');
      const title = lines[0].replace(/^# /, '');
      const content = lines.slice(1).join('\n');
      
      return {
        index,
        title,
        content,
      };
    });
  } catch (error) {
    console.error('Error loading slides:', error);
  }
};

// Initialize auth
const initAuth = async () => {
  const session = await checkAuth();
  if (session) {
    user.value = await getUser();
  }
  
  // Listen for auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      user.value = session.user;
    } else {
      user.value = null;
    }
  });
  
  return subscription;
};

// Handle login
const handleLogin = async () => {
  try {
    await loginWithGoogle();
  } catch (error) {
    console.error('Login failed:', error);
  }
};

// Handle logout
const handleLogout = async () => {
  try {
    await doLogout();
  } catch (error) {
    console.error('Logout failed:', error);
  }
};

// Initialize on mount
onMounted(async () => {
  await initAuth();
  await loadSlides();
  
  // Initialize Reveal.js
  if (user.value) {
    const revealElement = document.querySelector('.reveal');
    if (revealElement) {
      const reveal = new Reveal(revealElement, {
        plugins: [
          RevealMarkdown,
          RevealHighlight,
          RevealNotes,
        ],
      });
      
      reveal.initialize({
        hash: true,
        transition: 'slide',
        transitionSpeed: 'default',
        backgroundTransition: 'fade',
      });
      
      reveal.addEventListener('slidechanged', (event: any) => {
        console.log('Slide changed:', event.indexh, event.indexv);
      });
    }
  }
});
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.auth-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  z-index: 1000;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.auth-header h1 {
  color: white;
  font-size: 1.5rem;
  font-weight: 600;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 15px;
  color: white;
}

.user-info span {
  font-size: 0.9rem;
}

.user-info button {
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.3);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.user-info button:hover {
  background: rgba(255,255,255,0.3);
}

.login-buttons {
  display: flex;
  gap: 10px;
}

.google-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  color: #333;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.google-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.google-icon {
  width: 20px;
  height: 20px;
}

.slide-deck {
  margin-top: 60px;
  min-height: calc(100vh - 60px);
}

.login-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.login-box {
  background: white;
  padding: 40px;
  border-radius: 16px;
  text-align: center;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

.login-box h2 {
  color: #333;
  margin-bottom: 15px;
  font-size: 1.8rem;
}

.login-box p {
  color: #666;
  margin-bottom: 25px;
  line-height: 1.6;
}

.slide-title {
  font-size: 3rem;
  margin-bottom: 20px;
  color: #667eea;
}

.slide-content {
  padding: 40px;
  font-size: 1.2rem;
  line-height: 1.8;
  color: #444;
}

.slide-content h1 {
  font-size: 3rem;
  margin-bottom: 20px;
  color: #333;
}

.slide-content h2 {
  font-size: 2rem;
  margin-bottom: 15px;
  color: #667eea;
}

.slide-content h3 {
  font-size: 1.5rem;
  margin-bottom: 10px;
  color: #764ba2;
}

.slide-content p {
  font-size: 1.2rem;
  line-height: 1.8;
  margin-bottom: 15px;
  color: #444;
}

.slide-content ul {
  list-style: none;
  padding-left: 0;
}

.slide-content li {
  padding: 10px 0;
  padding-left: 25px;
  position: relative;
  font-size: 1.1rem;
  line-height: 1.6;
}

.slide-content li::before {
  content: '•';
  position: absolute;
  left: 0;
  color: #667eea;
  font-weight: bold;
  font-size: 1.5rem;
}

.slide-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
}

.slide-content th,
.slide-content td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.slide-content th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
}

.slide-content pre {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 15px 0;
}

.slide-content code {
  font-family: 'Fira Code', 'Courier New', monospace;
  font-size: 0.9rem;
}

@media (max-width: 768px) {
  .auth-header h1 {
    font-size: 1.2rem;
  }
  
  .slide-title {
    font-size: 2rem;
  }
  
  .slide-content {
    padding: 20px;
    font-size: 1rem;
  }
  
  .slide-content h1 {
    font-size: 2rem;
  }
  
  .slide-content h2 {
    font-size: 1.5rem;
  }
  
  .slide-content p,
  .slide-content li {
    font-size: 1rem;
  }
}
</style>
