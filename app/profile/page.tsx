// app/profile/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrivateHeader from '@/components/header/PrivateHeader'
import UpdateDisplayName from '@/components/profile/UpdateDisplayName'
import MyStudents from '@/components/profile/MyStudents'

function pickDisplayName(user: { user_metadata?: unknown; email?: string | null }): string {
  const meta = user.user_metadata;
  if (meta && typeof meta === 'object' && 'display_name' in meta) {
    const v = (meta as { display_name?: unknown }).display_name;
    if (typeof v === 'string') return v;
  }
  return user.email?.split('@')?.[0] ?? '';
}

export default async function Profile() {
  const supabase = await createClient()

  // Authenticated read (verifies via /auth/v1/user)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const displayName = pickDisplayName(user)

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <PrivateHeader />
      <div className="flex-1 w-full flex flex-col items-center pt-20">
        <div className="w-full max-w-md p-8">
          <UpdateDisplayName initialDisplayName={displayName} />
          <MyStudents />
        </div>
      </div>
    </div>
  )
}
