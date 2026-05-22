import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://pnqrxgluwphrfazvvuma.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucXJ4Z2x1d3BocmZhenZ2dW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTYwODQsImV4cCI6MjA5MDE5MjA4NH0.hCtQz4BOgYXEm0CSs0jc44zQd_9CG8wDPNDdYMQYWy4";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});