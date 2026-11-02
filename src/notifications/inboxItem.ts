// Notification links come from the server; anything that is not a same-origin path counts as Home.
// Browsers read '\' as '/' and drop tabs/newlines, so '/\evil.example' or '/\t/evil.example' would leave the site.
// eslint-disable-next-line no-control-regex
export const internalPath = (url: string) => url.startsWith('/') && !url.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(url) ? url : '/'

/**
 * Team announcements (and anything else linking to Home) have no page of their own: Home does not show them.
 * These open in place in the Inbox to show the full message; everything with a real page navigates there,
 * including announcements-category notices such as the join welcome, which links to setup.
 */
export const opensInPlace = (item: { category: string; url: string }) => internalPath(item.url) === '/'
