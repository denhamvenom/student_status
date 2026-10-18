export const financeExportCopy = {
  title: 'Export finances',
  description: "Download charges and payments for the students you choose. The file lists personal payments and fundraising credit apart. Each charge row repeats the student's available balance, so do not add those up.",
  scope: 'Students to include', allActive: 'All active students', selected: 'Selected student', prepare: 'Prepare export', preparing: 'Preparing student list…', ready: 'Export prepared', retry: 'Retry preparation', fresh: 'Prepare a new export', csv: 'Download charge details (CSV)', manifest: 'Download student list and collection details (JSON)', collecting: 'Collecting and verifying all records…', cancel: 'Cancel collection',
  metadata: 'Also download the JSON file. It lists every student included, even those with no charges, and when the data was gathered.',
  range: 'The data is gathered over a short time, not at one exact moment.',
  expired: 'This export has expired. Prepare a new export.', failed: 'Export could not finish. No partial file was downloaded.', cancelled: 'Collection cancelled. No file was downloaded.', loading: 'Loading export status…', unavailable: 'Financial export is unavailable. Refresh your access or prepare a new export.', completed: 'Download requested after every student and charge page was verified.', recover: 'Try again', members: 'Students included',
} as const
