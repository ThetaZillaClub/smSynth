// components/profile/DisplayForm.tsx
"use client"

import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEffect, useMemo, useState } from "react"

type Props = {
  initialDisplayName: string   // <-- required now
  onSuccess: (newName: string) => void
}

export default function DisplayForm({ initialDisplayName, onSuccess }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [displayName, setDisplayName] = useState<string>(initialDisplayName ?? "")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // keep input in sync if parent passes a fresh name after save
  useEffect(() => {
    setDisplayName(initialDisplayName ?? "")
  }, [initialDisplayName])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = displayName.trim()
    if (!next) return setError("Display name can’t be empty.")
    if (next === (initialDisplayName ?? "").trim()) return setError("That’s already your display name.")

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { data, error } = await supabase.auth.updateUser({ data: { display_name: next } })
      if (error) throw error
      const saved = ((data?.user?.user_metadata as any)?.display_name as string | undefined) ?? next
      setSuccess(true)
      onSuccess(saved)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
    } finally {
      setIsLoading(false)
    }
  }

  const disabled =
    isLoading ||
    !displayName.trim() ||
    displayName.trim() === (initialDisplayName ?? "").trim()

  return (
    <form onSubmit={handleUpdate} className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold mb-6 text-[#0f0f0f]">Update Display Name</h1>

      <div className="grid gap-2">
        <Label htmlFor="displayName" className="text-[#0f0f0f] font-medium">New Display Name</Label>
        <Input
          id="displayName"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={100}
          className="h-10 rounded-md bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2] focus:border-[#0f0f0f] focus:ring-0"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Display name updated successfully!</p>}

      <button
        type="submit"
        disabled={disabled}
        className="w-full h-10 rounded-md bg-[#d7d7d7] text-[#0f0f0f] font-medium transition duration-200 hover:bg-[#d2d2d2] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
      >
        {isLoading ? "Updating..." : "Save Changes"}
      </button>
    </form>
  )
}
