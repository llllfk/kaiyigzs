import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { contactSubmissions } from '@/storage/database/shared/schema';
import { notifyWecomContactSubmission } from '@/lib/wecom';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, contact, message } = body;

    if (!name || !contact || !message) {
      return NextResponse.json(
        { error: '请填写完整信息' },
        { status: 400 }
      );
    }

    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor
      ? forwardedFor.split(',')[0].trim()
      : request.headers.get('x-real-ip') || 'unknown';

    let ipLocation = '';
    if (ip && ip !== 'unknown') {
      try {
        const locationRes = await fetch(`https://ipapi.co/${ip}/json/`, {
          signal: AbortSignal.timeout(3000),
        });
        if (locationRes.ok) {
          const locationData = await locationRes.json() as {
            city?: string;
            region?: string;
            country_name?: string;
          };
          const parts = [
            locationData.city,
            locationData.region,
            locationData.country_name,
          ].filter(Boolean);
          ipLocation = parts.join(', ');
        }
      } catch {
        // IP location lookup failed, continue without it
      }
    }

    await notifyWecomContactSubmission({
      name: String(name),
      contact: String(contact),
      message: String(message),
      ip,
      ipLocation,
    });

    try {
      const db = getDb();
      await db.insert(contactSubmissions).values({
        name: String(name),
        contact: String(contact),
        message: String(message),
        ip,
        ip_location: ipLocation || null,
      });
    } catch (err) {
      console.error('[contact] db insert failed:', err);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
