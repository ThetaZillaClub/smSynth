"use client";

import React from "react";

type Props = {
  label: string;
  value: string;
  mono?: boolean;
};

export default function StatCard({ label, value, mono }: Props) {
  return (
    <div className="rounded-md p-4 bg-[#ebebeb] border border-[#d2d2d2]">
      <div className="text-[#2d2d2d]">{label}</div>
      <div className={`text-xl ${mono ? "font-mono" : ""} text-[#0f0f0f]`}>{value}</div>
    </div>
  );
}
