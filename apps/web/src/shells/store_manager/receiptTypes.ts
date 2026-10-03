export type IssueType = 'damaged' | 'short' | 'wrong';
export interface ReceiptResult { orderId: string; at: string; kind: 'ok' | 'issue'; issue?: IssueType }
export const issueLabel: Record<IssueType, string> = { damaged: 'Damaged', short: 'Short quantity', wrong: 'Wrong item' };
export const nowColombo = () => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Colombo' }).format(new Date());
