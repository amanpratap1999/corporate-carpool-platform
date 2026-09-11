const fs = require('fs');

let sql = fs.readFileSync('migrations/0005_rename_fields.sql', 'utf8');

sql += `
ALTER TABLE rides ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rides ADD COLUMN started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rides ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE ride_requests ADD COLUMN responded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ride_requests ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
`;

fs.writeFileSync('migrations/0005_rename_fields.sql', sql, 'utf8');
console.log('Appended SQL to migration file');
