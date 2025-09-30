// app/student-settings/page.tsx
import ModelSettingsForm from '@/components/model-settings/ModelSettingsForm';

export default function StudentSettings() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <div className="flex-1 w-full flex flex-col items-center pt-8">
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-12 text-center">
          Student Settings
        </h1>
        <div className="w-full max-w-md p-8">
          <ModelSettingsForm />
        </div>
      </div>
    </div>
  );
}
