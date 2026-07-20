import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (process.env.MONITOR_ONLY === 'true' && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/eightam-monitor', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/'],
}
