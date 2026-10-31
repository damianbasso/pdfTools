export class PageRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageRangeError';
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (/encrypt/i.test(message)) {
      return 'This PDF is password-protected, so it cannot be edited here.';
    }
    if (message && message.length <= 240) return message;
  }
  return 'Could not read that file.';
}
