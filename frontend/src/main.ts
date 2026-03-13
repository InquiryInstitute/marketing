import { createApp } from 'vue';
import App from './App.vue';
import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Check authentication status on load
export async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Google login
export async function loginWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
      redirectTo: window.location.origin + window.location.pathname,
    },
  });
  
  if (error) {
    console.error('Login error:', error);
    throw error;
  }
  
  return data;
}

// Logout
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

// Get current user
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Initialize app
const app = createApp(App);
app.mount('#app');
