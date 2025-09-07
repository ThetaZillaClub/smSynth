import type { FC, JSX } from 'react';

interface PrivacySettingsProps {
  value: string;
  onChange: (value: string) => void;
}

const PrivacySettings: FC<PrivacySettingsProps> = ({ value, onChange }): JSX.Element => (
  <div className="grid gap-2">
    <label htmlFor="privacy" className="text-[#0f0f0f] font-medium">Privacy</label>
    <select 
      id="privacy"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-md bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2] focus:border-[#0f0f0f] focus:ring-0 px-3"
    >
      <option value="">Select privacy</option>
      <option value="public">Public</option>
      <option value="private">Private</option>
    </select>
  </div>
);

export default PrivacySettings;