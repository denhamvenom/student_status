export const financeExportCopy = {
  title: 'Export finances',
  description: 'Download one row per charge with personal payments and fundraising credits shown separately. Wallet balances repeat across charge rows and must not be added together.',
  scope: 'Members to include', allActive: 'All active members', selected: 'Selected student', prepare: 'Prepare export', preparing: 'Preparing member list…', ready: 'Export prepared', retry: 'Retry preparation', fresh: 'Prepare a new export', csv: 'Download charges CSV', manifest: 'Download member manifest', collecting: 'Collecting and verifying all records…', cancel: 'Cancel collection',
  metadata: 'Download the member manifest as well. It records the complete member list, including members with no charges, and the collection time range.',
  range: 'Records reflect their state when each page was collected. This is a collection over a time range, not one instantaneous accounting snapshot.',
  expired: 'This export has expired. Prepare a new export.', failed: 'Export could not finish. No partial file was downloaded.', cancelled: 'Collection cancelled. No file was downloaded.', loading: 'Loading export status…', unavailable: 'Financial export is unavailable. Refresh your access or prepare a new export.', completed: 'Download requested after every member and charge page was verified.', recover: 'Try again', members: 'Members captured',
} as const
