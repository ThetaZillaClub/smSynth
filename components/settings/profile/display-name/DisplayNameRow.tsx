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
      const { error } = await supabase.auth.updateUser({ data: { display_name: next } });
      if (error) throw error;
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
