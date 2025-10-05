// app/home/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HomeHeader from '@/components/home/HomeHeader'
import StatsBento from '@/components/home/StatsBento'
import HomeCardGrid from '@/components/home/HomeCardGrid'

function pickDisplayName(user: { user_metadata?: unknown; email?: string | null }): string {
  const meta = user.user_metadata;
  if (meta && typeof meta === 'object' && 'display_name' in meta) {
    const v = (meta as { display_name?: unknown }).display_name;
    if (typeof v === 'string') return v;
  }
  return user.email?.split('@')?.[0] ?? '';
}

function pickAvatarUrl(user: { user_metadata?: unknown }): string | null {
  const meta = user.user_metadata;
  if (meta && typeof meta === 'object' && 'avatar_url' in meta) {
    const v = (meta as { avatar_url?: unknown }).avatar_url;
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const displayName = pickDisplayName(user)
  const avatarUrl = pickAvatarUrl(user)

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <div className="px-6 pt-8 pb-12 max-w-7xl mx-auto">
        <HomeHeader displayName={displayName} avatarUrl={avatarUrl} />

        <div className="mt-6">
          <StatsBento />
        </div>

        <div className="mt-6">
          <HomeCardGrid />
        </div>
      </div>
    </div>
  )
}
