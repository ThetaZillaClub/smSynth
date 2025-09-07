'use client'
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import GenderSettings from './GenderSettings'
import PrivacySettings from './PrivacySettings'
import SubmitButton from './SubmitButton'
export default function ModelSettingsForm() {
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [privacy, setPrivacy] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()
  const onDrop = (acceptedFiles: File[]) => {
    setImage(acceptedFiles[0])
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] } })
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      // Upload image to Supabase storage if exists
      let imagePath = ''
      if (image) {
        const { data, error: uploadError } = await supabase.storage
          .from('model-images')
          .upload(`${Date.now()}_${image.name}`, image)
        if (uploadError) throw uploadError
        imagePath = data?.path || ''
      }
      // Insert into Supabase table (assume 'models' table exists)
      const { error: insertError } = await supabase.from('models').insert({
        name,
        gender,
        privacy,
        image_path: imagePath
      })
      if (insertError) throw insertError
      // Success - redirect or show message
      console.log('Model created successfully')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid gap-2">
        <Label htmlFor="name" className="text-[#0f0f0f] font-medium">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10 rounded-md bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2] focus:border-[#0f0f0f] focus:ring-0"
        />
      </div>
      <GenderSettings value={gender} onChange={setGender} />
      <PrivacySettings value={privacy} onChange={setPrivacy} />
      <div className="grid gap-2">
        <Label className="text-[#0f0f0f] font-medium">Image</Label>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed border-[#d2d2d2] rounded-md p-6 text-center cursor-pointer ${isDragActive ? 'bg-[#ebebeb]' : ''}`}
        >
          <input {...getInputProps()} />
          <p className="text-[#373737]">
            {image ? image.name : "Drag 'n' drop an image here, or click to select"}
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-center">
        <SubmitButton isLoading={isLoading} />
      </div>
    </form>
  )
}