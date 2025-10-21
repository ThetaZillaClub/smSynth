'use client'

import { cn } from '@/lib/utils'
import { type UseSupabaseUploadReturn } from '@/hooks/setup/use-supabase-upload'
import { Button } from '@/components/auth/button'
import { CheckCircle, File, Loader2, X } from 'lucide-react'
import Image from 'next/image'
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

export const formatBytes = (
  bytes: number,
  decimals = 2,
  size?: 'bytes' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB' | 'EB' | 'ZB' | 'YB'
) => {
  const k = 1000
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  if (bytes === 0 || bytes === undefined) return size ? `0 ${size}` : '0 bytes'
  const i = size !== undefined ? sizes.indexOf(size) : Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

type DropzoneCtx = UseSupabaseUploadReturn
const DropzoneContext = createContext<DropzoneCtx | undefined>(undefined)

export const useDropzoneContext = () => {
  const ctx = useContext(DropzoneContext)
  if (!ctx) throw new Error('useDropzoneContext must be used within <DropzoneRoot>')
  return ctx
}

/** Root: provide context so Frame (click area) and Panel (info) can live apart */
export const DropzoneRoot = ({
  children,
  ...ctx
}: PropsWithChildren<DropzoneCtx>) => {
  return <DropzoneContext.Provider value={ctx}>{children}</DropzoneContext.Provider>
}

/** Frame: the clickable area (your avatar square) */
export const DropzoneFrame = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => {
  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    isSuccess,
    errors,
    files,
    open,
  } = useDropzoneContext()

  const hasBlockingErrors =
    errors.length > 0 ||
    files.some((f) => f.errors.some((e) => e.code !== 'too-many-files'))

  const isInvalid = (isDragActive && isDragReject) || hasBlockingErrors

  const triggerFile = () => {
    try { open?.() } catch {}
  }

  return (
    <div
      {...getRootProps({
        className: cn(
          'border-2 border-gray-300 rounded-lg p-0 text-foreground cursor-pointer select-none',
          className,
          isSuccess ? 'border-solid' : 'border-dashed',
          isDragActive && 'border-primary bg-primary/10',
          isInvalid && 'border-destructive bg-destructive/10'
        ),
        role: 'button',
        tabIndex: 0,
        onClick: triggerFile,
        onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerFile() }
        },
        'aria-label': 'Upload file',
      })}
    >
      <input {...getInputProps()} />
      {children}
    </div>
  )
}

/** Panel: renders under the frame (file list + Upload button) */
export const DropzonePanel = ({ className }: { className?: string }) => {
  const {
    files, setFiles, onUpload, loading, successes, errors, maxFileSize, maxFiles, isSuccess,
  } = useDropzoneContext()

  const exceedMaxFiles = files.length > maxFiles
  const handleRemove = useCallback(
    (name: string) => setFiles(files.filter((f) => f.name !== name)),
    [files, setFiles]
  )

  if (isSuccess) {
    return (
      <div className={cn('flex items-center gap-2 justify-start', className)}>
        <CheckCircle size={16} className="text-primary" />
        <p className="text-primary text-sm">
          Successfully uploaded {files.length} file{files.length > 1 ? 's' : ''}
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {files.map((file, idx) => {
        const rowErr = errors.find((e) => e.name === file.name)
        const ok = !!successes.find((n) => n === file.name)
        const visibleErrors = file.errors.filter((e) => e.code !== 'too-many-files')

        return (
          <div
            key={`${file.name}-${idx}`}
            className="flex items-center gap-x-4 border-b py-2"
          >
            {file.type.startsWith('image/') ? (
              <div className="h-10 w-10 rounded border overflow-hidden shrink-0 bg-muted grid place-items-center">
                <Image src={file.preview} alt={file.name} width={40} height={40} unoptimized className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="h-10 w-10 rounded border bg-muted grid place-items-center">
                <File size={18} />
              </div>
            )}

            <div className="grow min-w-0">
              <p className="text-sm truncate" title={file.name}>{file.name}</p>
              {visibleErrors.length > 0 ? (
                <p className="text-xs text-destructive">
                  {visibleErrors.map((e) =>
                    e.message.startsWith('File is larger than')
                      ? `File is larger than ${formatBytes(maxFileSize, 2)} (Size: ${formatBytes(file.size, 2)})`
                      : e.message
                  ).join(', ')}
                </p>
              ) : loading && !ok ? (
                <p className="text-xs text-muted-foreground">Uploading file...</p>
              ) : rowErr ? (
                <p className="text-xs text-destructive">Failed to upload: {rowErr.message}</p>
              ) : ok ? (
                <p className="text-xs text-primary">Successfully uploaded file</p>
              ) : (
                <p className="text-xs text-muted-foreground">{formatBytes(file.size, 2)}</p>
              )}
            </div>

            {!loading && !ok && (
              <Button
                size="icon"
                variant="link"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => handleRemove(file.name)}
              >
                <X />
              </Button>
            )}
          </div>
        )
      })}

      {exceedMaxFiles && (
        <p className="text-sm mt-2 text-destructive">
          You may upload only up to {maxFiles} files, please remove {files.length - maxFiles} file{files.length - maxFiles > 1 ? 's' : ''}.
        </p>
      )}

      {files.length > 0 && !exceedMaxFiles && (
        <div className="mt-2">
          <Button
            variant="outline"
            onClick={onUpload}
            disabled={loading || files.some((f) => f.errors.some((e) => e.code !== 'too-many-files'))}
          >
            {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>) : (<>Upload files</>)}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Simple “?” center fill for avatar squares */
export const DropzoneEmptyState = ({ className }: { className?: string }) => {
  const { isSuccess } = useDropzoneContext()
  if (isSuccess) return null
  return (
    <div className={cn('w-full h-full grid place-items-center', className)}>
      <span className="text-4xl font-bold text-[#6b6b6b] leading-none select-none">?</span>
    </div>
  )
}

/* --- Back-compat exports (optional): keep names some places might import --- */
export const Dropzone = DropzoneFrame
export const DropzoneContent = DropzonePanel
