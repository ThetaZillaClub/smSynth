// components/settings/profile/display-name/DisplayNameRow.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/auth/input';
import { Button } from '@/components/auth/button';

type Props = {
  initialName: string;
  onChanged: (newName: string) => void;
};

export default function DisplayNameRow({ initialName, onChanged }: Props) {
  const supabase = React.useMemo(() => createClient(), []);
  const [value, setValue] = React.useState(initialName ?? '');
  const [editing, setEditing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const isDirty = value.trim() && value.trim() !== (initialName ?? '').trim();

  React.useEffect(() => {
    setValue(initialName ?? '');
  }, [initialName]);

  const onSave = async () => {
    setErr(null);
    setLoading(true);
    try {
      const next = value.trim();
      if (!next) throw new Error("Display name can't be empty.");

      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not signed in');

      // Find latest model id for this user
      const { data: latest, error: findErr } = await supabase
        .from('models')
        .select('id')
        .eq('uid', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findErr) throw findErr;
      if (!latest?.id) throw new Error('No model row to update.');

      // Update creator_display_name
      const { error: updErr } = await supabase
        .from('models')
        .update({ creator_display_name: next })
        .eq('id', latest.id);

      if (updErr) throw updErr;

      onChanged(next);
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message || 'Failed to update display name.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Single row: label + field + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[#0f0f0f] font-medium shrink-0">Display Name</span>

        <div className="flex items-center gap-3 max-w-xl grow">
          <Input
            id="settings-display-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-10 rounded-md bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2] focus:border-[#0f0f0f] focus:ring-0 grow"
            readOnly={!editing}
          />

          {!editing ? (
            <Button type="button" onClick={() => setEditing(true)}>
              Update
            </Button>
          ) : (
            <>
              <Button
                type="button"
                onClick={onSave}
                disabled={loading || !isDirty}
              >
                {loading ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setEditing(false); setValue(initialName ?? ''); setErr(null); }}
                disabled={loading}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
