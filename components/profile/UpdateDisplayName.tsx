"use client";
import { useState } from "react";
import DisplayForm from "./DisplayForm";

export default function UpdateDisplayName({ initialDisplayName }: { initialDisplayName: string }) {
  const [currentDisplayName, setCurrentDisplayName] = useState(initialDisplayName ?? "");
  const [showForm, setShowForm] = useState(!currentDisplayName);

  const handleSuccess = (newName: string) => {
    setCurrentDisplayName(newName); // updates the heading immediately
    setShowForm(false);
  };

  return (
    <div className="w-full">
      {!!currentDisplayName && (
        <h1 className="text-3xl font-bold mb-6 text-[#0f0f0f] text-center">
          Welcome {currentDisplayName}!
        </h1>
      )}
      {showForm ? (
        <DisplayForm initialDisplayName={currentDisplayName} onSuccess={handleSuccess} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full h-10 rounded-md bg-[#d7d7d7] text-[#0f0f0f] font-medium transition duration-200 hover:bg-[#d2d2d2] active:scale-[0.98]"
        >
          Update Display Name
        </button>
      )}
    </div>
  );
}
