/** Admin access cannot work because something is not configured (no password, no session secret). Maps to a 503. */
export class AdminNotConfiguredError extends Error {
  constructor(message = 'Admin access is not configured') {
    super(message);
    this.name = 'AdminNotConfiguredError';
  }
}
