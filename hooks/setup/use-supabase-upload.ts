'use client';

import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type FileError, type FileRejection, useDropzone } from 'react-dropzone'

interface FileWithPreview extends File {
  preview?: string
  errors: readonly FileError[]
}

type UseSupabaseUploadOptions = {
  /** Name of bucket to upload files to in your Supabase project */
  bucketName: string
  /** Optional folder path inside the bucket (e.g. "avatars") */
  path?: string
  /** Allowed MIME types (supports wildcards like "image/*") */
  allowedMimeTypes?: string[]
  /** Max size per file (bytes) */
  maxFileSize?: number
  /** Max number of files per upload */
  maxFiles?: number
  /** Cache-Control seconds (default 3600) */
  cacheControl?: number
  /** Overwrite if exists (default false) */
  upsert?: boolean
}

type UseSupabaseUploadReturn = ReturnType<typeof useSupabaseUpload>

/** Internal result from each upload attempt */
type UploadResult = { name: string; message?: string }

const useSupabaseUpload = (options: UseSupabaseUploadOptions) => {
  const supabase = useMemo(() => createClient(), [])

  const {
    bucketName,
    path,
    allowedMimeTypes = [],
    maxFileSize = Number.POSITIVE_INFINITY,
    maxFiles = 1,
    cacheControl = 3600,
    upsert = false,
  } = options

  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  // For errors we store only failed items, with a definite `message: string`
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([])
  const [successes, setSuccesses] = useState<string[]>([])

  const isSuccess = useMemo(() => {
    if (errors.length === 0 && successes.length === 0) return false
    if (errors.length === 0 && successes.length === files.length) return true
    return false
  }, [errors.length, successes.length, files.length])

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      const validFiles = acceptedFiles
        .filter((file) => !files.find((x) => x.name === file.name))
        .map((file) => {
          ;(file as FileWithPreview).preview = URL.createObjectURL(file)
          ;(file as FileWithPreview).errors = []
          return file as FileWithPreview
        })

      const invalidFiles = fileRejections.map(({ file, errors }) => {
        ;(file as FileWithPreview).preview = URL.createObjectURL(file)
        ;(file as FileWithPreview).errors = errors
        return file as FileWithPreview
      })

      setFiles([...files, ...validFiles, ...invalidFiles])
    },
    [files]
  )

  const dropzoneProps = useDropzone({
    onDrop,
    noClick: true,
    accept: allowedMimeTypes.reduce<Record<string, string[]>>(
      (acc, type) => ({ ...acc, [type]: [] }),
      {}
    ),
    maxSize: maxFileSize,
    maxFiles,
    multiple: maxFiles !== 1,
  })

  const onUpload = useCallback(async () => {
    setLoading(true)

    // Partial retry: reattempt files that failed previously, and any not yet uploaded
    const filesWithErrors = new Set(errors.map((x) => x.name))
    const uploaded = new Set(successes)
    const filesToUpload =
      filesWithErrors.size > 0
        ? files.filter((f) => filesWithErrors.has(f.name) || !uploaded.has(f.name))
        : files

    const responses: UploadResult[] = await Promise.all(
      filesToUpload.map(async (file) => {
        const { error } = await supabase.storage
          .from(bucketName)
          .upload(!!path ? `${path}/${file.name}` : file.name, file, {
            cacheControl: String(cacheControl),
            upsert,
          })
        return { name: file.name, message: error?.message }
      })
    )

    // Narrow to errors (message is a string)
    const responseErrors = responses.filter(
      (x): x is { name: string; message: string } => typeof x.message === 'string'
    )
    setErrors(responseErrors)

    // Narrow to successes (no message)
    const responseSuccesses = responses.filter((x) => !x.message)
    const newSuccesses = Array.from(
      new Set([...successes, ...responseSuccesses.map((x) => x.name)])
    )
    setSuccesses(newSuccesses)

    setLoading(false)
  }, [supabase, files, path, bucketName, errors, successes, cacheControl, upsert])

  useEffect(() => {
    if (files.length === 0) setErrors([])

    // If file count is within maxFiles, drop "too-many-files" errors from items
    if (files.length <= maxFiles) {
      let changed = false
      const newFiles = files.map((file) => {
        if (file.errors.some((e) => e.code === 'too-many-files')) {
          file.errors = file.errors.filter((e) => e.code !== 'too-many-files')
          changed = true
        }
        return file
      })
      if (changed) setFiles(newFiles)
    }
  }, [files.length, maxFiles, files])

  return {
    files,
    setFiles,
    successes,
    isSuccess,
    loading,
    errors,
    setErrors,
    onUpload,
    maxFileSize,
    maxFiles,
    allowedMimeTypes,
    ...dropzoneProps,
  }
}

export { useSupabaseUpload, type UseSupabaseUploadOptions, type UseSupabaseUploadReturn }
