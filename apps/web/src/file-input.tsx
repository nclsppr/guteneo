import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentPropsWithRef,
} from "react";
import { t } from "./locale";

type FileInputProps = Omit<
  ComponentPropsWithRef<"input">,
  "type" | "value" | "defaultValue"
>;

/** Keep native file selection and validation, with product-language copy. */
export function FileInput({
  id,
  ref,
  className,
  disabled,
  multiple,
  onChange,
  "aria-describedby": describedBy,
  ...props
}: FileInputProps) {
  const generatedId = useId();
  const selectionId = `${id ?? generatedId}-selection`;
  const input = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  // The native input covers the zone, so a dropped file is a normal selection.
  const [dragging, setDragging] = useState(false);
  useImperativeHandle(ref, () => input.current!, []);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => setNames([]);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  return (
    <span
      className={["file-input", className].filter(Boolean).join(" ")}
      data-disabled={disabled || undefined}
      data-dragging={dragging || undefined}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDrop={() => setDragging(false)}
    >
      <input
        {...props}
        id={id}
        ref={input}
        type="file"
        className="file-input-native"
        disabled={disabled}
        multiple={multiple}
        aria-describedby={[describedBy, selectionId].filter(Boolean).join(" ")}
        onChange={(event) => {
          setNames(
            Array.from(event.currentTarget.files ?? [], (file) => file.name),
          );
          onChange?.(event);
        }}
      />
      <span className="file-input-button" aria-hidden="true">
        {multiple ? t.fileInput.chooseMultiple : t.fileInput.choose}
      </span>
      <span
        className="file-input-name"
        id={selectionId}
        aria-live="polite"
        aria-atomic="true"
      >
        {names.length ? names.join(", ") : t.fileInput.empty}
      </span>
      {!names.length && (
        <span className="file-input-drop" aria-hidden="true">
          {t.fileInput.drop}
        </span>
      )}
    </span>
  );
}
