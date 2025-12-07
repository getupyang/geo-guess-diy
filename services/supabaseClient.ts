import { createClient } from '@supabase/supabase-js';

// 修复: 在 Vite/Vercel 环境中必须使用 import.meta.env
// 我们提供默认占位符，防止因缺少变量导致 createClient 直接抛出错误使应用白屏。
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'placeholder';

if (supabaseUrl === 'https://placeholder.supabase.co') {
  console.warn("⚠️ Supabase 环境变量缺失！请检查 Vercel Settings 中的 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);