// components/settings/profile/profile-layout.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import AvatarRow from './avatar/AvatarRow';
import DisplayNameRow from './display-name/DisplayNameRow';

export default function ProfileLayout() {
  const supabase = React.useMemo(() => createClient(), []);
  const [displayName, setDisplayName] = React.useState<string>('You');

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancel) return;
      const user = session?.user;
      const dn =
        (user?.user_metadata?.display_name as string | undefined)?.trim() ||
        user?.email?.split('@')?.[0] ||
        'You';
      setDisplayName(dn);
    })();
    return () => { cancel = true; };
  }, [supabase]);

  return (
    <div className="space-y-8">
      {/* Row 1: Avatar + Display Name (on shell background, not a card) */}
      <AvatarRow name={displayName} />

      {/* Row 2: Display Name field + Update flow */}
      <DisplayNameRow
        initialName={displayName}
        onChanged={(next) => setDisplayName(next)}
      />
    </div>
  );
}
