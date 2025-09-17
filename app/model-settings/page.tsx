import PrimaryHeader from "@/components/header/PrimaryHeader";
import ModelSettingsForm from "@/components/model-settings/ModelSettingsForm";

export default function ModelSettings() {
  return (
    <>
      <PrimaryHeader />
      <div className="flex min-h-screen w-full flex-col items-center bg-[#f0f0f0] pt-32">
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-12 text-center text-[#0f0f0f]">
          Model Settings
        </h1>
        <div className="w-full max-w-md p-8">
          <ModelSettingsForm />
        </div>
      </div>
    </>
  );
}
