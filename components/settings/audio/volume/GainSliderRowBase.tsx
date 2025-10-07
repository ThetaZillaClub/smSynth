// components/settings/audio/volume/GainSliderRowBase.tsx
"use client";

import * as React from "react";
import { gainToDb, gainToSlider, sliderToGain, MIN_DB, MAX_DB } from "./VolumeMath";

type Props = {
  label: string;
  value: number;                      // linear gain in our mapped range
  onChange: (gain: number) => void;   // sets linear gain
  onTest?: () => void | Promise<void>;
};

export default function GainSliderRowBase({ label, value, onChange, onTest }: Props) {
  const [sliderU, setSliderU] = React.useState<number>(() => gainToSlider(value));

  React.useEffect(() => {
    setSliderU(gainToSlider(value));
  }, [value]);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const u = Number(e.target.value) / 100;
    setSliderU(u);
    onChange(sliderToGain(u));
  };

  const rawDb = Math.round(gainToDb(value));
  const db = Math.max(MIN_DB, Math.min(MAX_DB, rawDb)); // clamp to [-60..-5]

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-[#0f0f0f]">{label}</span>
        <span className="text-xs text-[#6b6b6b]">{db} dB</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Slider */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(sliderU * 100)}
          onChange={onInput}
          aria-label={`${label} volume`}
          className="w-52 sm:w-64 h-2 rounded-full appearance-none bg-[#e5e5e5] outline-none
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-[#0f0f0f]
                     [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                     [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#0f0f0f]"
        />

        {/* Readout */}
        <span className="text-sm tabular-nums text-[#0f0f0f] w-12 text-right">
          {Math.round(sliderU * 100)}%
        </span>

        {/* Test button (black speaker icon on #f9f9f9) */}
        {onTest && (
          <button
            type="button"
            onClick={() => void onTest()}
            aria-label={`Test ${label.toLowerCase()}`}
            className="inline-flex items-center justify-center rounded-full border border-[#dcdcdc] bg-[#f9f9f9] text-[#0f0f0f] shadow-sm transition active:scale-[0.98]"
            style={{ width: 36, height: 36 }}
            title="Play test"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              {/* speaker body */}
              <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
              {/* waves */}
              <path d="M16 9.5c1.2 1.2 1.2 3.8 0 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M18.5 7c2.4 2.4 2.4 7.6 0 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
