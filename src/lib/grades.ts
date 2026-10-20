export const grades = ['Freshman', 'Sophomore', 'Junior', 'Senior'] as const
export type Grade = (typeof grades)[number]

/** Interpret only unambiguous high-school grade names and numbers. */
export function canonicalGrade(value: string | null | undefined): Grade | null {
  if (!value) return null
  const key = value.trim().toLowerCase().replace(/[\s._-]+/g, '')
  switch (key) {
    case '9': case '9th': case 'grade9': case 'grade9th': case '9grade': case '9thgrade': case 'ninth': case 'ninthgrade': case 'gradeninth': case 'freshman': return 'Freshman'
    case '10': case '10th': case 'grade10': case 'grade10th': case '10grade': case '10thgrade': case 'tenth': case 'tenthgrade': case 'gradetenth': case 'sophomore': return 'Sophomore'
    case '11': case '11th': case 'grade11': case 'grade11th': case '11grade': case '11thgrade': case 'eleventh': case 'eleventhgrade': case 'gradeeleventh': case 'junior': return 'Junior'
    case '12': case '12th': case 'grade12': case 'grade12th': case '12grade': case '12thgrade': case 'twelfth': case 'twelfthgrade': case 'gradetwelfth': case 'senior': return 'Senior'
    default: return null
  }
}

export function displayedGrade(value: string | null | undefined): string {
  return canonicalGrade(value) ?? value ?? ''
}

/** New choices are fixed; an unrecognized old value may only be saved unchanged. */
export function gradeForSave(value: string, existing: readonly (string | null | undefined)[] = []): string {
  const canonical = canonicalGrade(value)
  if (canonical) return canonical
  if (value && existing.some(prior => prior === value)) return value
  throw new Error('Choose Freshman, Sophomore, Junior, or Senior.')
}

export function sameGrade(left: string, right: string): boolean {
  const a = canonicalGrade(left), b = canonicalGrade(right)
  return a && b ? a === b : left === right
}
