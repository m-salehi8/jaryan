import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";

/**
 * JalaliDatePicker — single-date Persian picker that emits ISO (gregorian) strings
 * for storage, while displaying the Jalali date to the user.
 */
export default function JalaliDatePicker({ value, onChange, placeholder = "تاریخ را انتخاب کنید…", disabled = false, testId }) {
  return (
    <DatePicker
      value={value || ""}
      onChange={(d) => {
        if (!d) return onChange?.("");
        // Convert to gregorian ISO for storage
        const g = d.convert(gregorian).format("YYYY-MM-DD");
        onChange?.(g);
      }}
      calendar={persian}
      locale={persian_fa}
      calendarPosition="bottom-right"
      placeholder={placeholder}
      disabled={disabled}
      format="YYYY/MM/DD"
      containerClassName="w-full"
      inputClass="rmdp-input"
      portal
      render={(stringValue, openCalendar) => (
        <input
          data-testid={testId}
          type="text"
          readOnly
          onClick={() => !disabled && openCalendar()}
          value={stringValue}
          placeholder={placeholder}
          disabled={disabled}
          className="rmdp-input"
          dir="rtl"
        />
      )}
    />
  );
}
