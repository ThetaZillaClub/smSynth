'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/auth/input';
import { Button } from '@/components/auth/button';

type Props = {
  initialName: string;
  onChanged: (newName: string) => void;
};

const ROW = "grid items-center gap-3 grid-cols-[160px_minmax(0,1fr)_220px]";
const LABEL = "text-sm font-medium text-[#0f0f0f]";
const BTN = "h-9 px-3 text-sm"; // uniform smaller size

export default function DisplayNameRow({ initialName, onChanged }: Props) {
  const supabase = React.useMemo(() => createClient(), []);
  const [value, setValue] = React.useState(initialName ?? '');
  const [editing, setEditing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const isDirty = value.trim() && value.trim() !== (initialName ?? '').trim();

  React.useEffect(() => { setValue(initialName ?? ''); }, [initialName]);

  const onSave = async () => {
    setErr(null);
    setLoading(true);
    try {
      const next = value.trim();
      if (!next) throw new Error("Display name can't be empty.");

      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not signed in');

      const { data: latest, error: findErr } = await supabase
        .from('models')
        .select('id')
        .eq('uid', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findErr) throw findErr;
      if (!latest?.id) throw new Error('No model row to update.');

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
      <div className={ROW}>
        <span className={LABEL}>Display Name</span>

        <div className="w-full">
          <Input
            id="settings-display-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full h-10 rounded-md bg-[#f8f8f8] text-[#0f0f0f] border border-[#d2d2d2] focus:border-[#0f0f0f] focus:ring-0"
            readOnly={!editing}
          />
        </div>

        <div className="w-full flex justify-start">
          {!editing ? (
            <Button type="button" onClick={() => setEditing(true)} className={BTN}>
              Update
            </Button>
          ) : (
            <div className="inline-flex gap-2">
              <Button
                type="button"
                onClick={onSave}
                disabled={loading || !isDirty}
                className={BTN}
              >
                {loading ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setEditing(false); setValue(initialName ?? ''); setErr(null); }}
                disabled={loading}
                className={BTN}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
