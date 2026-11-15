# Contributing to Study Buddy

Bug reports and pull requests are welcome.

## Reporting a bug

Open an issue with the bug report template: which mode you were in (work,
short or long break), what you expected, what happened, and your browser.

## Before opening a pull request

- Run the test suite - plain Node, no dependencies:

  ```sh
  node tests/app.test.js
  ```

- Study Buddy is deliberately minimal: one static page, no build step, no
  accounts, everything in localStorage. Keep it that way - no frameworks,
  trackers or external services.
- Timer behavior changes need a test in `tests/app.test.js` (the suite stubs
  the DOM and drives `app.js` directly).
