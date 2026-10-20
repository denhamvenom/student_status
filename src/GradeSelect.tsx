import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { displayedGrade, grades } from './lib/grades'

export function GradeSelect({ value, original, onChange }: { value: string; original?: string | null; onChange: (value: string) => void }) {
  const legacy = original && !grades.includes(displayedGrade(original) as (typeof grades)[number]) ? original : null
  return <NativeSelect required value={displayedGrade(value)} onChange={event => onChange(event.target.value)}>
    <NativeSelectOption value="">Choose a grade</NativeSelectOption>
    {legacy && <NativeSelectOption value={legacy}>{legacy} (earlier saved value)</NativeSelectOption>}
    {grades.map(grade => <NativeSelectOption key={grade} value={grade}>{grade}</NativeSelectOption>)}
  </NativeSelect>
}
