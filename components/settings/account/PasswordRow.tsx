"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/auth/input";
import { Button } from "@/components/auth/button";

const ROW = "grid items-center gap-3 grid-cols-[160px_minmax(0,1fr)_220px]";
const LABEL = "text-sm font-medium text-[#0f0f0f]";
// uniform small + light style you asked for
const BTN =
  "h-9 px-3 text-sm bg-[#f6f6f6] hover:bg-[#f9f9f9] text-[#0f0f0f] " +
  "border border-[#dcdcdc] rounded-md transition active:scale-[0.98] " +
  "disabled:opacity-60 disabled:pointer-events-none";

export default function PasswordRow() {
  const supabase = React.useMemo(() => createClient(), []);
  const [pw, setPw] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const isDirty = pw.length > 0 || confirm.length > 0;
  const isValid = pw.length >= 6 && pw === confirm;

  const reset = () => { setPw(""); setConfirm(""); setError(null); setOk(false); };

  const onSave = async () => {
    setError(null); setOk(false);
    if (!isValid) {
      if (pw.length < 6) setError("Password must be at least 6 characters.");
      else if (pw !== confirm) setError("Passwords do not match.");
      return;
    }
    try {
      setIsSaving(true);
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setOk(true);
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void onSave(); }}
      className="flex flex-col gap-2"
    >
      {/* New password row */}
      <div className={ROW}>
        <span className={LABEL}>New password</span>
        <div className="w-full">
          <Input
            id="settings-new-password"
            type="password"
            placeholder="New password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full h-10 rounded-md bg-[#f8f8f8] text-[#0f0f0f] border border-[#d2d2d2] focus:border-[#0f0f0f] focus:ring-0"
          />
          <p className="mt-1 text-xs text-[#6b6b6b]">Use at least 6 characters.</p>
        </div>
        <div />
      </div>

      {/* Confirm row */}
      <div className={ROW}>
        <span className={LABEL}>Confirm password</span>
        <div className="w-full">
          <Input
            id="settings-confirm-password"
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full h-10 rounded-md bg-[#f8f8f8] text-[#0f0f0f] border border-[#d2d2d2] focus:border-[#0f0f0f] focus:ring-0"
          />
        </div>
        <div />
      </div>

      {/* Actions row: left column only, Save first then Cancel */}
      <div className={`${ROW} mt-3 sm:mt-4`} >
        <div className="inline-flex gap-2">
          <Button type="submit" disabled={isSaving || !isDirty || !isValid} className={BTN}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" onClick={reset} disabled={isSaving && !ok} className={BTN}>
            Cancel
          </Button>
        </div>
        <div />
        <div />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-600">Password updated.</p>}
    </form>
  );
}
