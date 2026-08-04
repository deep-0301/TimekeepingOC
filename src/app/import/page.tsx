"use client";

import { useAppState } from "@/lib/AppStateContext";
import BookingSheetImport from "@/components/BookingSheetImport";
import BookingTypePicker from "@/components/BookingTypePicker";
import ManualWorkEntry from "@/components/ManualWorkEntry";
import ClearAllData from "@/components/ClearAllData";
import { BOOKING_TYPE_INFO, type BookingType } from "@/lib/bookingType";
import PanelHeading from "@/components/PanelHeading";

export default function ImportPage() {
  const {
    settings,
    saveSettings,
    updateEntries,
    updatePayPeriodAnchor,
    addShiftToDate,
    updateSpare,
    updateDayField,
    clearAllEntries,
  } = useAppState();

  const currentInfo = settings.bookingType
    ? BOOKING_TYPE_INFO[settings.bookingType]
    : null;

  return (
    <>
      <section className="panel">
        <PanelHeading
          title="Current booking"
          info="Changing this updates how many sheets are asked for below."
        />
        <div className="note" style={{ marginTop: -4, marginBottom: 10 }}>
          {currentInfo ? (
            <>
              <b>{currentInfo.label}</b> — {currentInfo.description}
            </>
          ) : (
            "You haven't picked a booking type yet."
          )}
        </div>
        <BookingTypePicker
          value={settings.bookingType}
          onChange={(bt: BookingType) =>
            saveSettings({ ...settings, bookingType: bt })
          }
        />
      </section>

      <BookingSheetImport
        onImport={updateEntries}
        onSeasonAnchorDetected={updatePayPeriodAnchor}
        bookingType={settings.bookingType}
      />
      <ManualWorkEntry
        onAddShift={addShiftToDate}
        onUpdateSpare={updateSpare}
        onUpdateDayField={updateDayField}
      />
      <ClearAllData onClearAll={clearAllEntries} />
    </>
  );
}
