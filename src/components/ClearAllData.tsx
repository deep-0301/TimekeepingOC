"use client";

import { useState } from "react";
import PanelHeading from "./PanelHeading";
import { Restart } from "./icons";

interface ClearAllDataProps {
  onClearAll: () => void;
}

export default function ClearAllData({ onClearAll }: ClearAllDataProps) {
  const [armed, setArmed] = useState(false);

  return (
    <section className="panel">
      <PanelHeading
        title="Start over"
        Icon={Restart}
        info="This clears every day you've imported or entered — booked shifts, day off, spare, everything. There's no undo, so only use this if you want to wipe the calendar and begin again."
      />
      {!armed ? (
        <button className="danger-solid" onClick={() => setArmed(true)}>
          Clear all my data
        </button>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 8,
          }}
        >
          <span>Are you sure? This can&apos;t be undone.</span>
          <button
            className="danger-solid"
            onClick={() => {
              onClearAll();
              setArmed(false);
            }}
          >
            Yes, clear everything
          </button>
          <button className="ghost small" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
