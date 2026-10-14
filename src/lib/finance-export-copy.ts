export const financeExportCopy = {
  title: 'Export finances',
  description: 'Download charges and payments for the selected students. The charge file separates personal payments from fundraising credit. Available balances repeat on each charge row; do not add those repeated balances together.',
  scope: 'Students to include', allActive: 'All active students', selected: 'Selected student', prepare: 'Prepare export', preparing: 'Preparing student list…', ready: 'Export prepared', retry: 'Retry preparation', fresh: 'Prepare a new export', csv: 'Download charge details (CSV)', manifest: 'Download student list and collection details (JSON)', collecting: 'Collecting and verifying all records…', cancel: 'Cancel collection',
  metadata: 'Download the JSON file too. It lists every included student, including those with no charges, and records when the data was collected.',
  range: 'Records are collected over a time range. They do not all represent one moment in time.',
  expired: 'This export has expired. Prepare a new export.', failed: 'Export could not finish. No partial file was downloaded.', cancelled: 'Collection cancelled. No file was downloaded.', loading: 'Loading export status…', unavailable: 'Financial export is unavailable. Refresh your access or prepare a new export.', completed: 'Download requested after every student and charge page was verified.', recover: 'Try again', members: 'Students included',
} as const
