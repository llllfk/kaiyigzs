import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface Product {
  id: string;
  name: string;
  url: string | null;
  description: string;
  icon: string | null;
}

export async function GET() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('products')
    .select('id, name, url, description, icon')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: `查询产品失败: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data as Product[] });
}
