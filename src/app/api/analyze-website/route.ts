import { NextResponse } from 'next/server';
import { analyzeWebsite } from '@/services/hybridScraper';

export const maxDuration = 300; // 5 minutes max for scraper

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    const result = await analyzeWebsite(url);
    
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[analyze-website API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
