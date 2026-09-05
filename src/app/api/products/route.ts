import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { getDb } from '@/storage/database/db';
import { products } from '@/storage/database/shared/schema';

export interface Product {
  id: string;
  name: string;
  url: string | null;
  description: string;
  icon: string | null;
  sort_order: number;
}

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        url: products.url,
        description: products.description,
        icon: products.icon,
        sort_order: products.sort_order,
      })
      .from(products)
      .orderBy(asc(products.sort_order));

    return NextResponse.json({ data: rows as Product[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(
      { error: `查询产品失败: ${message}` },
      { status: 500 }
    );
  }
}
