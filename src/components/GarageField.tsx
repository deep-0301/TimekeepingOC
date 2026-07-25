"use client";

import { useState } from "react";

export const GARAGES = [
  "Industrial",
  "Merivale",
  "Pinecrest",
  "St-Laurent",
  "Any Garage",
];

export default function GarageField({
  label = "Garage",
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isKnown = GARAGES.includes(value);
  const [showOther, setShowOther] = useState(value !== "" && !isKnown);

  return (
    <div className="field">
      <label>{label}</label>
      <select
        value={showOther ? "other" : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "other") {
            setShowOther(true);
            onChange("");
          } else {
            setShowOther(false);
            onChange(v);
          }
        }}
      >
        <option value="" disabled>
          Choose a garage
        </option>
        {GARAGES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
        <option value="other">Other…</option>
      </select>
      {showOther && (
        <input
          type="text"
          value={value}
          placeholder="Garage name"
          onChange={(e) => onChange(e.target.value)}
          style={{ marginTop: 6 }}
        />
      )}
    </div>
  );
}
