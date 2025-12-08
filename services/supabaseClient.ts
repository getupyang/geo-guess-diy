
import { createClient } from '@supabase/supabase-js';

// 优先使用环境变量 (Vercel)，如果缺失则使用您提供的兜底 Key (Preview 环境)
// 注意：公开 Key 通常只在开发阶段这样做，生产环境请确保环境变量配置正确。
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://qvpfnnmrusqvjbspnfpe.supabase.co';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2cGZubm1ydXNxdmpic3BuZnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMjE1OTIsImV4cCI6MjA4MDY5NzU5Mn0.6H7bkRicIsPZKnfMfWxMDe_Z-XIfXrB7EjVFhX9__6Q';

if (!supabaseUrl || supabaseUrl === 'undefined') {
  console.error("Critical: Supabase URL missing.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
