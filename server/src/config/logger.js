// ANSI colour codes
const RESET  = '\x1b[0m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const GRAY   = '\x1b[90m';

function timestamp() {
  return new Date().toISOString();
}

export const logger = {
  info(...args) {
    console.log(`${CYAN}[INFO]${RESET}  ${timestamp()}`, ...args);
  },
  warn(...args) {
    console.warn(`${YELLOW}[WARN]${RESET}  ${timestamp()}`, ...args);
  },
  error(...args) {
    console.error(`${RED}[ERROR]${RESET} ${timestamp()}`, ...args);
  },
  debug(...args) {
    console.debug(`${GRAY}[DEBUG]${RESET} ${timestamp()}`, ...args);
  },
};

export default logger;
