import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
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

    // Get client IP
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor
      ? forwardedFor.split(',')[0].trim()
      : request.headers.get('x-real-ip') || 'unknown';

    // Try to get IP location
    let ipLocation = '';
    if (ip && ip !== 'unknown') {
      try {
        const locationRes = await fetch(`https://ipapi.co/${ip}/json/`, {
          signal: AbortSignal.timeout(3000),
        });
        if (locationRes.ok) {
          const locationData = await locationRes.json();
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

    const client = getSupabaseClient();

    const { error } = await client.from('contact_submissions').insert({
      name,
      contact,
      message,
      ip,
      ip_location: ipLocation || null,
    });

    if (error) {
      return NextResponse.json(
        { error: `提交失败: ${error.message}` },
        { status: 500 }
      );
    }

    // Notify WeCom robot (non-blocking for the user-facing result)
    await notifyWecomContactSubmission({
      name: String(name),
      contact: String(contact),
      message: String(message),
      ip,
      ipLocation,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
