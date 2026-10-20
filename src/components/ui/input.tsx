import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"
import { normalizeChangedEmail, normalizeChangedPhone } from "../../../shared/contact-format"

type InputProps = React.ComponentProps<"input">

function PlainInput({ className, type, ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "min-h-11 w-full min-w-0 rounded-sm border border-input bg-card px-3 py-2 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

/** Keep free typing, then format edited contacts when the user leaves the field. */
function ContactInput({ type, onChange, onBlur, onFocus, onInvalid, ...props }: InputProps) {
  const initial = React.useRef(String(props.value ?? props.defaultValue ?? ""))
  const lastValue = React.useRef(initial.current)
  const element = React.useRef<HTMLInputElement | null>(null)
  const edited = React.useRef(false)
  const [error, setError] = React.useState("")
  const errorId = React.useId()
  const normalize = type === "tel" ? normalizeChangedPhone : normalizeChangedEmail
  React.useEffect(() => {
    if (props.value !== undefined && String(props.value) !== lastValue.current) {
      initial.current = String(props.value)
      lastValue.current = initial.current
      edited.current = false
      element.current?.setCustomValidity("")
      setError("")
    }
  }, [props.value])
  const validate = (input: HTMLInputElement, show: boolean) => {
    let message = ""
    try { normalize(input.value, initial.current) }
    catch (cause) { message = cause instanceof Error ? cause.message : "Check this contact information." }
    input.setCustomValidity(message)
    if (show) setError(message)
    return !message
  }
  return <>
    <PlainInput {...props}
      ref={input => {
        element.current = input
        if (typeof props.ref === "function") return props.ref(input)
        if (props.ref) props.ref.current = input
      }}
      // Custom validation accepts unchanged legacy email values and surrounding
      // whitespace while retaining the email keyboard and autofill hints.
      type={type === "email" ? "text" : type}
      inputMode={props.inputMode ?? (type === "email" ? "email" : "tel")}
      autoComplete={props.autoComplete ?? (type === "email" ? "email" : "tel")}
      autoCapitalize={props.autoCapitalize ?? "none"}
      aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={[props["aria-describedby"], error ? errorId : undefined].filter(Boolean).join(" ") || undefined}
      onFocus={event => {
        if (!edited.current) initial.current = event.currentTarget.value
        onFocus?.(event)
      }}
      onChange={event => {
        edited.current = true
        lastValue.current = event.currentTarget.value
        validate(event.currentTarget, !!error)
        onChange?.(event)
      }}
      onBlur={event => {
        const input = event.currentTarget
        if (edited.current && validate(input, true)) {
          const value = normalize(input.value, initial.current)
          if (value !== input.value) {
            input.value = value
            lastValue.current = value
            onChange?.({ ...event, target: input, currentTarget: input } as React.ChangeEvent<HTMLInputElement>)
          }
        }
        onBlur?.(event)
      }}
      onInvalid={event => {
        validate(event.currentTarget, true)
        onInvalid?.(event)
      }}
    />
    {error && <span id={errorId} role="alert" className="block text-sm text-destructive">{error}</span>}
  </>
}

function Input(props: InputProps) {
  return props.type === "tel" || props.type === "email" ? <ContactInput {...props}/> : <PlainInput {...props}/>
}

export { Input }
