const fs = require('fs');

let code = fs.readFileSync('src/infrastructure/db/schema.ts', 'utf8');

code = code.replace(
  "cancelled_reason: text('cancelled_reason'),",
  "cancelled_reason: text('cancelled_reason'),\n    cancelled_at: timestamp('cancelled_at', { withTimezone: true }),\n    started_at: timestamp('started_at', { withTimezone: true }),\n    completed_at: timestamp('completed_at', { withTimezone: true }),"
);

code = code.replace(
  "cancellation_reason: text('cancellation_reason'),",
  "cancellation_reason: text('cancellation_reason'),\n    responded_at: timestamp('responded_at', { withTimezone: true }),\n    cancelled_at: timestamp('cancelled_at', { withTimezone: true }),"
);

fs.writeFileSync('src/infrastructure/db/schema.ts', code, 'utf8');
console.log('Added missing timestamps to schema.ts');
