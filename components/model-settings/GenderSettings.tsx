import type { FC, JSX } from 'react';

interface GenderSettingsProps {
  value: string;
  onChange: (value: string) => void;
}

const GenderSettings: FC<GenderSettingsProps> = ({ value, onChange }): JSX.Element => (
  <div className="grid gap-2">
    <label htmlFor="gender" className="text-[#0f0f0f] font-medium">Gender</label>
    <select 
      id="gender"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-md bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2] focus:border-[#0f0f0f] focus:ring-0 px-3"
    >
      <option value="">Select gender</option>
      <option value="male">Male</option>
      <option value="female">Female</option>
    </select>
  </div>
);

export default GenderSettings;